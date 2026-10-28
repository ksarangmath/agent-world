import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Vector3 } from 'three'
import type { WorldPerson } from '../../shared/api'
import { placesById, type Activity } from '../../shared/map/places'
import { positionOnRoute, type Route } from '../../shared/map/route'
import { onScreen, viewFrom } from './clock'
import { hash, surfaceAt } from './elevation'
import { hovered } from './hover'
import type { RouteReply, RouteRequest } from './routing.worker'
import { Sprites, type Facing, type Placement } from './sprites'

const capacity = 2000
const hoverZoom = 14
const hitPixels = 16
const seated = new Set<Activity>(['coding', 'coffee', 'eating', 'reading', 'chess', 'picnic'])
const across = Math.hypot(viewFrom.x, viewFrom.z)
const ahead = { x: -viewFrom.x / across, y: -viewFrom.z / across }

function facingOf(heading: number): Facing {
  const [hx, hy] = [Math.sin(heading), Math.cos(heading)]
  const sideways = -hx * ahead.y + hy * ahead.x
  const away = hx * ahead.x + hy * ahead.y
  if (Math.abs(sideways) > Math.abs(away)) return sideways > 0 ? 3 : 1
  return away > 0 ? 0 : 2
}

export const crowd = {
  count: 0,
  x: new Float32Array(capacity),
  y: new Float32Array(capacity),
  shown: new Uint8Array(capacity),
}
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
  useEffect(() => {
    crowd.count = shown.length
  }, [shown])
  const avatars = useMemo(() => shown.map((person) => person.avatar), [shown])

  const screen = useRef(new Float32Array(capacity * 2).fill(Number.NaN))
  const press = useRef<{ pointer: number; x: number; y: number; moved: boolean } | null>(null)
  useEffect(() => {
    const canvas = gl.domElement
    const nearest = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect()
      const [px, py] = [event.clientX - bounds.left, event.clientY - bounds.top]
      let [best, bestDistance] = [-1, hitPixels ** 2]
      for (let i = 0; i < shown.length; i++) {
        const [sx, sy] = [screen.current[i * 2]!, screen.current[i * 2 + 1]!]
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
  }, [gl, shown, onSelect])
  useEffect(() => () => hovered.set(null), [])

  const projected = useMemo(() => new Vector3(), [])
  const placements = useRef<(Placement | null)[]>([])

  useFrame(() => {
    const now = Date.now() + serverOffsetMs
    const hoverable = camera.zoom >= hoverZoom
    placements.current.length = shown.length
    shown.forEach((person, i) => {
      let [x, y] = [person.tile.x + 0.5, person.tile.y + 0.5]
      const t = now / 1000 + hash(person.tile.x, person.tile.y) * 50
      const spot = placesById.get(person.placeId)
      let heading = spot
        ? Math.atan2(spot.center.x - person.tile.x, spot.center.y - person.tile.y)
        : 0
      let motion: Placement['motion'] = 'idle'
      const trip = trips[i]
      const partner = partners[i] === undefined ? undefined : shown[partners[i]!]
      let hide = false
      if (trip && now < trip.arrives) {
        const path = routes.current.get(trip.key)
        if (path) {
          const step = positionOnRoute(path, (now - trip.departed) / 1000)
          ;[x, y, heading] = [step.x + 0.5, step.y + 0.5, step.heading]
          if (step.mode !== 'ride') motion = 'walk'
        } else {
          hide = true
        }
      } else if (partner) {
        heading = Math.atan2(partner.tile.x - person.tile.x, partner.tile.y - person.tile.y)
      } else {
        const activity = spot?.activity ?? 'chatting'
        if (seated.has(activity)) motion = 'sit'
        if (activity === 'running') {
          const lap = t * 1.3
          x += 0.3 * Math.cos(lap)
          y += 0.3 * Math.sin(lap)
          heading = Math.atan2(-Math.sin(lap), Math.cos(lap))
          motion = 'walk'
        } else if (activity === 'hiking') {
          x += 0.3 * Math.sin(t * 0.5)
          heading = Math.cos(t * 0.5) > 0 ? Math.PI / 2 : -Math.PI / 2
          motion = 'walk'
        }
      }
      crowd.x[i] = x
      crowd.y[i] = y
      crowd.shown[i] = hide ? 0 : 1
      screen.current[i * 2] = Number.NaN
      if (hide || !onScreen(x, y)) {
        placements.current[i] = null
        return
      }
      const ground = surfaceAt(x, y)
      placements.current[i] = {
        x,
        y,
        ground,
        facing: facingOf(heading),
        motion,
        seconds: t,
        talking: partner !== undefined,
      }
      if (hoverable) {
        projected.set(x, ground + 0.6, y).project(camera)
        screen.current[i * 2] = ((projected.x + 1) / 2) * size.width
        screen.current[i * 2 + 1] = ((1 - projected.y) / 2) * size.height
      }
    })
  })

  return <Sprites avatars={avatars} placements={placements} />
}
