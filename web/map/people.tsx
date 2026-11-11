import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Vector3 } from 'three'
import type { WorldPerson } from '../../shared/api'
import { placesById, type Activity } from '../../shared/map/places'
import { positionOnRoute, type Route } from '../../shared/map/route'
import { onScreen, viewFrom } from './clock'
import { doingNow } from './doing'
import { surfaceAt } from './decks'
import { hash } from './elevation'
import { closeIn, stopFlight, track } from './camera'
import { following, hovered } from './watching'
import type { RouteReply, RouteRequest } from './routing.worker'
import { body, Sprites, type Facing, type Placement } from './sprites'

const capacity = 2000
const hoverZoom = 14
const hitMargin = 12
const seated = new Set<Activity>(['coding', 'coffee', 'eating', 'reading', 'chess', 'picnic'])
const strollEvery = 28
const strollFor = 7
const strollRadius = 0.9
const performing = new Set<Activity>(['pitching', 'music'])
const working = new Set<Activity>(['tinkering', 'art'])
const afloat = new Set<Activity>(['surfing', 'sailing'])
const across = Math.hypot(viewFrom.x, viewFrom.z)
const ahead = { x: -viewFrom.x / across, y: -viewFrom.z / across }

function facingOf(heading: number): Facing {
  const [hx, hy] = [Math.sin(heading), Math.cos(heading)]
  const sideways = -hx * ahead.y + hy * ahead.x
  const away = hx * ahead.x + hy * ahead.y
  if (Math.abs(sideways) > Math.abs(away)) return sideways > 0 ? 3 : 1
  return away > 0 ? 0 : 2
}

const crowd = {
  x: new Float32Array(capacity),
  y: new Float32Array(capacity),
  shown: new Uint8Array(capacity),
}
export const talks = {
  count: 0,
  id: Array.from({ length: capacity }, () => ''),
  x: new Float32Array(capacity),
  y: new Float32Array(capacity),
  height: new Float32Array(capacity),
}
export const sleepers = {
  count: 0,
  x: new Float32Array(capacity),
  y: new Float32Array(capacity),
  height: new Float32Array(capacity),
}
const bubbleLift = 1.7
const rise = viewFrom.y / across
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
  const avatars = useMemo(() => shown.map((person) => person.avatar), [shown])

  const screen = useRef(new Float32Array(capacity * 3).fill(Number.NaN))
  const press = useRef<{ pointer: number; x: number; y: number; moved: boolean } | null>(null)
  useEffect(() => {
    const canvas = gl.domElement
    const nearest = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect()
      const [px, py] = [event.clientX - bounds.left, event.clientY - bounds.top]
      const [halfWidth, halfHeight] = [
        (body.width * camera.zoom) / 2,
        (body.height * camera.zoom) / 2,
      ]
      let [best, bestMiss, bestDepth] = [
        -1,
        Math.max(hitMargin, body.reach * camera.zoom),
        Infinity,
      ]
      for (let i = 0; i < shown.length; i++) {
        const [x, feet, depth] = [
          screen.current[i * 3]!,
          screen.current[i * 3 + 1]!,
          screen.current[i * 3 + 2]!,
        ]
        if (Number.isNaN(x)) continue
        const miss = Math.max(
          0,
          Math.abs(x - px) - halfWidth,
          Math.abs(feet - halfHeight - py) - halfHeight,
        )
        if (miss < bestMiss || (miss === bestMiss && depth < bestDepth)) {
          ;[best, bestMiss, bestDepth] = [i, miss, depth]
        }
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
              doing: doingNow(person, shown),
              x: event.clientX,
              y: event.clientY,
            }
          : null,
      )
    }
    const current = hovered.get()
    if (current) {
      const person = shown.find((candidate) => candidate.id === current.id)
      hovered.set(person ? { ...current, doing: doingNow(person, shown) } : null)
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
  }, [gl, camera, shown, onSelect])
  useEffect(() => () => hovered.set(null), [])

  const projected = useMemo(() => new Vector3(), [])
  const placements = useRef<(Placement | null)[]>([])
  const followed = useRef<string | null>(null)
  useEffect(
    () =>
      following.subscribe(() => {
        if (followed.current && !following.get()) stopFlight()
        followed.current = null
      }),
    [],
  )
  useEffect(() => {
    const id = following.get()?.id
    if (id && !shown.some((person) => person.id === id)) following.set(null)
  }, [shown])

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
      let lift = 0
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
        const myTurn = Math.floor(now / 3000) % 2 === (i < partners[i]! ? 0 : 1)
        if (myTurn) motion = 'talk'
      } else if (person.asleep) {
        motion = 'idle'
      } else if (t % strollEvery < strollFor && !afloat.has(spot?.activity ?? 'chatting')) {
        const along = (t % strollEvery) / strollFor
        const direction = hash(person.tile.y, person.tile.x) * Math.PI * 2
        const out = strollRadius * Math.sin(along * Math.PI)
        x += out * Math.sin(direction)
        y += out * Math.cos(direction)
        heading = along < 0.5 ? direction : direction + Math.PI
        motion = 'walk'
      } else {
        const activity = spot?.activity ?? 'chatting'
        if (seated.has(activity)) motion = 'sit'
        else if (performing.has(activity)) {
          motion = 'perform'
          x += 0.12 * Math.sin(t * 2.2)
        } else if (working.has(activity)) {
          motion = 'work'
          x += 0.15 * Math.sin(t * 1.4)
        } else if (activity === 'chatting' && Math.floor(t / 4) % 4 === 0) motion = 'talk'
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
        } else if (afloat.has(activity)) {
          x += 1.6 * Math.sin(t * 0.6)
          heading = Math.cos(t * 0.6) > 0 ? Math.PI / 2 : -Math.PI / 2
          lift = 0.12 * Math.sin(t * 3)
        } else if (activity === 'climbing') {
          heading = Math.atan2(ahead.x, ahead.y)
          lift = 0.6 + 0.6 * Math.sin(t * 0.7)
        }
      }
      crowd.x[i] = x
      crowd.y[i] = y
      if (person.id === following.get()?.id && !hide) {
        if (followed.current === person.id) track(x, y)
        else closeIn(x, y)
        followed.current = person.id
      }
      crowd.shown[i] = hide ? 0 : 1
      screen.current[i * 3] = Number.NaN
      if (hide || !onScreen(x, y)) {
        placements.current[i] = null
        return
      }
      const ground = surfaceAt(x, y) + lift
      placements.current[i] = {
        x,
        y,
        ground,
        facing: facingOf(heading),
        motion,
        seconds: t,
      }
      if (hoverable) {
        projected.set(x, ground, y).project(camera)
        screen.current[i * 3] = ((projected.x + 1) / 2) * size.width
        screen.current[i * 3 + 1] = ((1 - projected.y) / 2) * size.height
        screen.current[i * 3 + 2] = projected.z
      }
    })
    sleepers.count = 0
    shown.forEach((person, i) => {
      if (!person.asleep || !placements.current[i]) return
      const k = sleepers.count++
      sleepers.x[k] = crowd.x[i]!
      sleepers.y[k] = crowd.y[i]!
      sleepers.height[k] = placements.current[i]!.ground + bubbleLift
    })
    talks.count = 0
    shown.forEach((person, i) => {
      const j = partners[i]
      if (j === undefined || j < i || !crowd.shown[i] || !crowd.shown[j]) return
      const [x, y] = [(crowd.x[i]! + crowd.x[j]!) / 2, (crowd.y[i]! + crowd.y[j]!) / 2]
      if (!onScreen(x, y)) return
      const k = talks.count++
      const headOf = (talker: number) =>
        surfaceAt(crowd.x[talker]!, crowd.y[talker]!) +
        rise * ((crowd.x[talker]! - x) * ahead.x + (crowd.y[talker]! - y) * ahead.y)
      talks.id[k] = person.conversationId!
      talks.x[k] = x
      talks.y[k] = y
      talks.height[k] = Math.max(headOf(i), headOf(j)) + bubbleLift
    })
  })

  return <Sprites avatars={avatars} placements={placements} />
}
