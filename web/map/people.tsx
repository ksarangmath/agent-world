import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Color, Matrix4, Object3D, Vector3, type InstancedMesh } from 'three'
import type { WorldPerson } from '../../shared/api'
import { placesById } from '../../shared/map/places'
import { positionOnRoute, type Route } from '../../shared/map/route'
import {
  activityPose,
  humanoidParts,
  partKeys,
  talkingPose,
  walkingPose,
  type PartKey,
  type Pose,
} from '../humanoid/model'
import { onScreen } from './clock'
import { hash, surfaceAt } from './elevation'
import type { RouteReply, RouteRequest } from './routing.worker'

const capacity = 2000
const scale = 0.42
const nameTagZoom = 14
const hidden = new Matrix4().makeScale(0, 0, 0)
const riding: Pose = { lift: 0, roll: 0, legs: [0, 0], arms: [-0.2, -0.2] }
const tripKey = (person: WorldPerson) =>
  person.trip && `${person.trip.from.x},${person.trip.from.y}>${person.tile.x},${person.tile.y}`

function partnersOf(people: WorldPerson[]): (number | undefined)[] {
  const byConversation = new Map<string, number[]>()
  people.forEach((person, i) => {
    if (!person.conversationId) return
    byConversation.set(person.conversationId, [
      ...(byConversation.get(person.conversationId) ?? []),
      i,
    ])
  })
  return people.map((person, i) =>
    person.conversationId
      ? byConversation.get(person.conversationId)!.find((j) => j !== i)
      : undefined,
  )
}

type Props = { people: WorldPerson[]; serverOffsetMs: number }

export function People({ people, serverOffsetMs }: Props) {
  const meshes = useRef<Partial<Record<PartKey, InstancedMesh | null>>>({})
  const tags = useRef(new Map<string, HTMLAnchorElement>())
  const { gl, camera, size } = useThree()
  const shown = useMemo(() => people.slice(0, capacity), [people])
  const routes = useRef(new Map<string, Route>())
  const trips = useMemo(
    () =>
      shown.map((person) =>
        person.trip
          ? {
              key: tripKey(person)!,
              from: person.trip.from,
              departed: Date.parse(person.trip.departedAt),
              arrives: Date.parse(person.trip.arrivesAt),
            }
          : null,
      ),
    [shown],
  )
  const router = useRef<Worker | null>(null)
  const requested = useRef(new Set<string>())
  useEffect(() => {
    const [pending, known] = [requested.current, routes.current]
    const worker = new Worker(new URL('./routing.worker.ts', import.meta.url), { type: 'module' })
    worker.addEventListener('message', ({ data }: MessageEvent<RouteReply>) => {
      if (pending.has(data.key)) known.set(data.key, data.route)
    })
    router.current = worker
    return () => {
      worker.terminate()
      router.current = null
      pending.clear()
      known.clear()
    }
  }, [])
  useEffect(() => {
    const active = new Set(trips.map((trip) => trip?.key))
    for (const key of requested.current) {
      if (!active.has(key)) {
        requested.current.delete(key)
        routes.current.delete(key)
      }
    }
    trips.forEach((trip, i) => {
      if (!trip || requested.current.has(trip.key)) return
      requested.current.add(trip.key)
      const request: RouteRequest = { key: trip.key, from: trip.from, to: shown[i]!.tile }
      router.current?.postMessage(request)
    })
  }, [trips, shown])
  const partners = useMemo(() => partnersOf(shown), [shown])
  const parts = useMemo(
    () =>
      shown.map((person) =>
        humanoidParts(person.avatar, {
          talking: person.conversationId !== null,
          vehicle: '#eef1f4',
        }),
      ),
    [shown],
  )

  useLayoutEffect(() => {
    const color = new Color()
    for (const key of partKeys) {
      const mesh = meshes.current[key]
      if (!mesh) continue
      parts.forEach((part, i) => mesh.setColorAt(i, color.set(part[key]?.color ?? '#000000')))
      mesh.count = shown.length
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  }, [parts, shown.length])

  useEffect(() => {
    const container = gl.domElement.parentElement
    const current = tags.current
    const ids = new Set(shown.map((person) => person.id))
    for (const person of shown) {
      const tag = current.get(person.id) ?? document.createElement('a')
      tag.className = 'name-tag'
      tag.textContent = person.name
      tag.href = `/people/${person.id}`
      if (!current.has(person.id)) container?.appendChild(tag)
      current.set(person.id, tag)
    }
    for (const [id, tag] of current) {
      if (!ids.has(id)) {
        tag.remove()
        current.delete(id)
      }
    }
  }, [gl, shown])
  useEffect(() => {
    const current = tags.current
    return () => current.forEach((tag) => tag.remove())
  }, [])

  const body = useMemo(() => new Object3D(), [])
  const local = useMemo(() => new Matrix4(), [])
  const pivot = useMemo(() => new Matrix4(), [])
  const matrix = useMemo(() => new Matrix4(), [])
  const stretch = useMemo(() => new Vector3(), [])
  const projected = useMemo(() => new Vector3(), [])

  useFrame(() => {
    const now = Date.now() + serverOffsetMs
    const showTags = camera.zoom >= nameTagZoom
    shown.forEach((person, i) => {
      let [x, y] = [person.tile.x + 0.5, person.tile.y + 0.5]
      const t = now / 1000 + hash(person.tile.x, person.tile.y) * 50
      const place = placesById.get(person.placeId)
      let heading = place
        ? Math.atan2(place.center.x - person.tile.x, place.center.y - person.tile.y)
        : 0
      let pose: Pose
      let vehicle = false
      const trip = trips[i]
      const partner = partners[i] === undefined ? undefined : shown[partners[i]!]
      let hide = false
      if (trip && now < trip.arrives) {
        const path = routes.current.get(trip.key)
        if (path) {
          const position = positionOnRoute(path, (now - trip.departed) / 1000)
          ;[x, y, heading] = [position.x + 0.5, position.y + 0.5, position.heading]
          vehicle = position.mode === 'ride'
        } else {
          hide = true
        }
        pose = vehicle ? riding : walkingPose(t)
      } else if (partner) {
        heading = Math.atan2(partner.tile.x - person.tile.x, partner.tile.y - person.tile.y)
        pose = talkingPose(t)
      } else {
        const activity = place?.activity ?? 'chatting'
        pose = activityPose(activity, t)
        if (activity === 'running') {
          const lap = t * 1.3
          x += 0.3 * Math.cos(lap)
          y += 0.3 * Math.sin(lap)
          heading = Math.atan2(-Math.sin(lap), Math.cos(lap))
        } else if (activity === 'hiking') {
          x += 0.3 * Math.sin(t * 0.5)
          heading = Math.cos(t * 0.5) > 0 ? Math.PI / 2 : -Math.PI / 2
        }
      }
      const tag = tags.current.get(person.id)
      if (hide || !onScreen(x, y)) {
        if (tag) tag.style.display = 'none'
        for (const key of partKeys) meshes.current[key]?.setMatrixAt(i, hidden)
        return
      }
      const ground = surfaceAt(x, y)
      body.position.set(x, ground + (vehicle ? 0.12 : 0) + pose.lift * scale, y)
      body.rotation.set(0, heading, pose.roll)
      body.scale.setScalar(scale)
      body.updateMatrix()
      for (const key of partKeys) {
        const mesh = meshes.current[key]
        const part = parts[i]![key]
        if (!mesh) continue
        if (!part || (key === 'vehicle' && !vehicle)) {
          mesh.setMatrixAt(i, hidden)
          continue
        }
        const width = key === 'dots' ? ((Math.floor(t * 3) % 3) + 1) / 3 : 1
        const [ox, oy, oz] = part.offset
        local
          .makeTranslation(ox - (part.size[0] * (1 - width)) / 2, oy, oz)
          .scale(stretch.set(part.size[0] * width, part.size[1], part.size[2]))
        if (part.limb) {
          const angle = (part.limb.kind === 'leg' ? pose.legs : pose.arms)[part.limb.side]
          local.premultiply(pivot.makeRotationX(angle))
          local.premultiply(pivot.makeTranslation(...part.limb.pivot))
        }
        mesh.setMatrixAt(i, matrix.multiplyMatrices(body.matrix, local))
      }
      if (!tag) return
      projected.set(x, ground + 0.85, y).project(camera)
      const visible = showTags && Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1
      tag.style.display = visible ? 'block' : 'none'
      if (visible) {
        tag.style.transform = `translate(${((projected.x + 1) / 2) * size.width}px, ${((1 - projected.y) / 2) * size.height}px) translate(-50%, -100%)`
      }
    })
    for (const key of partKeys) {
      const mesh = meshes.current[key]
      if (mesh) mesh.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <>
      {partKeys.map((key) => (
        <instancedMesh
          key={key}
          ref={(mesh) => {
            meshes.current[key] = mesh
          }}
          args={[undefined, undefined, capacity]}
          frustumCulled={false}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshLambertMaterial />
        </instancedMesh>
      ))}
    </>
  )
}
