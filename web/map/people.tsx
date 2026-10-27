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
import { hovered } from './hover'
import { toonBands } from './paint'
import type { RouteReply, RouteRequest } from './routing.worker'

const capacity = 2000
const scale = 0.8
const hoverZoom = 14
const hitPixels = 14

export const crowd = {
  count: 0,
  x: new Float32Array(capacity),
  y: new Float32Array(capacity),
  shown: new Uint8Array(capacity),
}
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

type Props = {
  people: WorldPerson[]
  serverOffsetMs: number
  onSelect: (personId: string) => void
}

export function People({ people, serverOffsetMs, onSelect }: Props) {
  const meshes = useRef<Partial<Record<PartKey, InstancedMesh | null>>>({})
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

  const screen = useMemo(() => new Float32Array(capacity * 2).fill(Number.NaN), [])
  const press = useRef<{ pointer: number; x: number; y: number; moved: boolean } | null>(null)
  useEffect(() => {
    const canvas = gl.domElement
    const nearest = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect()
      const [px, py] = [event.clientX - bounds.left, event.clientY - bounds.top]
      let [best, bestDistance] = [-1, hitPixels ** 2]
      for (let i = 0; i < shown.length; i++) {
        const [sx, sy] = [screen[i * 2]!, screen[i * 2 + 1]!]
        if (Number.isNaN(sx)) continue
        const d = (sx - px) ** 2 + (sy - py) ** 2
        if (d < bestDistance) [best, bestDistance] = [i, d]
      }
      return shown[best]
    }
    const move = (event: PointerEvent) => {
      const pressed = press.current
      if (pressed?.pointer === event.pointerId) {
        const distance = Math.abs(event.clientX - pressed.x) + Math.abs(event.clientY - pressed.y)
        if (distance > 6) pressed.moved = true
      }
      const person = nearest(event)
      canvas.style.cursor = person ? 'pointer' : ''
      hovered.set(
        person
          ? {
              id: person.id,
              name: person.name,
              placeId: person.placeId,
              x: event.clientX,
              y: event.clientY,
            }
          : null,
      )
    }
    const down = (event: PointerEvent) => {
      press.current =
        event.isPrimary && event.button === 0
          ? { pointer: event.pointerId, x: event.clientX, y: event.clientY, moved: false }
          : null
    }
    const up = (event: PointerEvent) => {
      const pressed = press.current
      const click = pressed?.pointer === event.pointerId && !pressed.moved
      press.current = null
      const person = click ? nearest(event) : undefined
      if (person) onSelect(person.id)
    }
    const cancel = () => {
      press.current = null
    }
    const leave = () => hovered.set(null)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointerleave', leave)
    canvas.addEventListener('pointercancel', cancel)
    return () => {
      canvas.removeEventListener('pointercancel', cancel)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointerleave', leave)
    }
  }, [gl, shown, screen, onSelect])
  useEffect(() => () => hovered.set(null), [])

  const body = useMemo(() => new Object3D(), [])
  const local = useMemo(() => new Matrix4(), [])
  const pivot = useMemo(() => new Matrix4(), [])
  const matrix = useMemo(() => new Matrix4(), [])
  const stretch = useMemo(() => new Vector3(), [])
  const projected = useMemo(() => new Vector3(), [])

  useFrame(() => {
    const now = Date.now() + serverOffsetMs
    const hoverable = camera.zoom >= hoverZoom
    crowd.count = shown.length
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
      crowd.x[i] = x
      crowd.y[i] = y
      crowd.shown[i] = hide ? 0 : 1
      screen[i * 2] = Number.NaN
      if (hide || !onScreen(x, y)) {
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
      if (!hoverable) return
      projected.set(x, ground + 0.5, y).project(camera)
      screen[i * 2] = ((projected.x + 1) / 2) * size.width
      screen[i * 2 + 1] = ((1 - projected.y) / 2) * size.height
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
          castShadow
          ref={(mesh) => {
            meshes.current[key] = mesh
          }}
          args={[undefined, undefined, capacity]}
          frustumCulled={false}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshToonMaterial gradientMap={toonBands} />
        </instancedMesh>
      ))}
    </>
  )
}
