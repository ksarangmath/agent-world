import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import { CatmullRomCurve3, Object3D, Vector3, type InstancedMesh } from 'three'
import { mapWidth, warp } from '../../shared/map/grid'
import {
  legSeconds,
  rideBoardingSeconds,
  rides,
  type Leg,
  type Route,
  type Tile,
} from '../../shared/map/route'
import { sky } from './clock'
import { surfaceAt } from './decks'
import { shoreDistance } from './elevation'
import { skyloop } from './skyloop'
import {
  box,
  ferryLanes,
  lamp,
  makePath,
  model,
  paint,
  sample,
  type Path,
  type Pose,
} from './traffic'

const most = 64
const walkSpeed = 1.2
const turnSeconds = 6
const ramp = 0.15
const mooring = 1.5
const clearOfFerries = 1.5
const probe = 0.25

const crafts = [
  {
    floor: 0.2,
    ahead: 0.3,
    climb: 0.6,
    docksBowIn: true,
    body: model(
      box(2.5, 0.12, 0.78, 0, -0.1, 0, '#22303c'),
      box(2.5, 0.16, 0.8, 0, 0.02, 0, '#f6f2e8'),
      box(0.4, 0.26, 0.54, 1.4, -0.08, 0, '#f6f2e8'),
      box(2.52, 0.045, 0.82, 0, 0.1, 0, '#e2574c'),
      box(2.3, 0.02, 0.62, 0, 0.18, 0, '#c9a36b'),
      box(0.55, 0.38, 0.58, -0.85, 0.2, 0, '#f6f2e8'),
      box(0.57, 0.14, 0.6, -0.85, 0.37, 0, '#2e3d4d'),
      box(0.66, 0.05, 0.68, -0.85, 0.58, 0, '#e2574c'),
    ),
    lights: model(
      box(0.58, 0.14, 0.61, -0.85, 0.37, 0, '#ffd690'),
      box(0.07, 0.07, 0.07, 1.56, 0.18, 0, '#fff3c4'),
    ),
  },
  {
    floor: 0.1,
    ahead: 0,
    climb: 0,
    docksBowIn: false,
    body: model(
      box(1.6, 0.1, 0.5, 0, 0, 0, '#2a3440'),
      box(1.6, 0.3, 0.05, 0, 0.1, 0.225, '#ff6b5a'),
      box(1.6, 0.3, 0.05, 0, 0.1, -0.225, '#ff6b5a'),
      box(0.05, 0.3, 0.5, 0.775, 0.1, 0, '#ff6b5a'),
      box(0.05, 0.3, 0.5, -0.775, 0.1, 0, '#ff6b5a'),
      box(1.62, 0.05, 0.52, 0, 0.24, 0, '#fff7e6'),
      box(0.2, 0.22, 0.42, 0.88, 0.06, 0, '#ff6b5a'),
      box(0.2, 0.22, 0.42, -0.88, 0.06, 0, '#ff6b5a'),
      box(0.04, 0.26, 0.46, 0.775, 0.4, 0, '#8fe9ff'),
      box(0.04, 0.26, 0.46, -0.775, 0.4, 0, '#8fe9ff'),
    ),
    lights: model(
      box(1.4, 0.03, 0.3, 0, -0.03, 0, '#49e6ff'),
      box(0.03, 0.08, 0.3, 0.99, 0.12, 0, '#fff3c4'),
      box(0.03, 0.08, 0.3, -0.99, 0.12, 0, '#fff3c4'),
    ),
  },
]
const [boat, pod] = [0, 1]

type Track = { craft: number; path: Path }
type Plan = {
  track: Track
  from: Tile
  to: Tile
  docked: number
  leaves: number
  board: number
  sails: number
  alight: number
}
export type Seat = { x: number; y: number; height: number; heading: number; walking: boolean }

export const carriers = {
  count: 0,
  craft: new Uint8Array(most),
  x: new Float32Array(most),
  y: new Float32Array(most),
  z: new Float32Array(most),
  heading: new Float32Array(most),
  pitch: new Float32Array(most),
}

const pose: Pose = { x: 0, y: 0, z: 0, heading: 0, pitch: 0, scale: 1, stretch: 1 }
const between = (a: Tile, b: Tile) => Math.hypot(a.x - b.x, a.y - b.y)
const center = (tile: Tile) => ({ x: tile.x + 0.5, y: tile.y + 0.5 })
const wet = (x: number, y: number) => shoreDistance[Math.floor(y) * mapWidth + Math.floor(x)]! > 0

function berth(pier: Tile, station: Tile): Tile[] {
  const far = between(pier, station)
  const [dx, dy] = [(station.x - pier.x) / far, (station.y - pier.y) / far]
  let reach = 0
  while (reach + probe < far && wet(pier.x + dx * (reach + probe), pier.y + dy * (reach + probe)))
    reach += probe
  const moored = reach - mooring
  return moored > probe ? [{ x: pier.x + dx * moored, y: pier.y + dy * moored }] : []
}

const lanes = ferryLanes.flatMap((stops) => {
  const line = stops.map(([lat, lon]) => {
    const [x, y] = warp(lon, lat)
    return { x, y }
  })
  const lane = line
    .map((point, i) => {
      const [before, after] = [line[Math.max(0, i - 1)]!, line[Math.min(line.length - 1, i + 1)]!]
      const aside = clearOfFerries / between(before, after)
      return {
        x: point.x - (after.y - before.y) * aside,
        y: point.y + (after.x - before.x) * aside,
      }
    })
    .filter((point) => wet(point.x, point.y))
  return [lane, [...lane].reverse()]
})

function sailing(from: Tile, to: Tile): Path {
  const detour = (lane: Tile[]) => between(lane[0]!, from) + between(lane.at(-1)!, to)
  const lane = lanes.reduce((best, way) => (detour(way) < detour(best) ? way : best))
  const stops = [...berth(lane[0]!, from), ...lane, ...berth(lane.at(-1)!, to).reverse()]
  const curve = new CatmullRomCurve3(
    stops.map(({ x, y }) => new Vector3(x, 0, y)),
    false,
    'centripetal',
  )
  const points = curve.getSpacedPoints(Math.ceil(curve.getLength()))
  return makePath(
    points.flatMap((point) => [point.x, point.z]),
    0,
    points.map(() => 0),
  )
}

function railing(from: Tile, to: Tile): Path {
  const { count, y, pods, stations, float } = skyloop
  const away = (i: number, tile: Tile) => Math.hypot(pods[i]!.x - tile.x, pods[i]!.z - tile.y)
  const stationNear = (tile: Tile) =>
    stations.reduce((best, i) => (away(i, tile) < away(best, tile) ? i : best))
  const [start, end] = [stationNear(from), stationNear(to)]
  const forward = (end - start + count) % count
  const steps = forward <= count / 2 ? forward : forward - count
  const ring = Array.from(
    { length: Math.abs(steps) + 1 },
    (_, k) => (start + Math.sign(steps) * k + count) % count,
  )
  return makePath(
    ring.flatMap((i) => [pods[i]!.x, pods[i]!.z]),
    0,
    ring.map((i) => y[i]! + float),
  )
}

const key = (from: Tile, to: Tile) => `${from.x},${from.y}>${to.x},${to.y}`
const tracks = new Map<string, Track>()
for (const ride of rides) {
  for (const [from, to] of [
    [ride.from, ride.to],
    [ride.to, ride.from],
  ] as const) {
    tracks.set(
      key(from, to),
      ride.by === 'ferry'
        ? { craft: boat, path: sailing(center(from), center(to)) }
        : { craft: pod, path: railing(center(from), center(to)) },
    )
  }
}

const trackOf = (leg?: Leg) =>
  leg?.mode === 'ride' ? tracks.get(key(leg.path[0]!, leg.path.at(-1)!)) : undefined

function headingAt(path: Path, distance: number) {
  sample(path, distance, pose)
  return pose.heading
}

const plans = new WeakMap<Route, (Plan | undefined)[]>()

function plansOf(trip: Route) {
  const known = plans.get(trip)
  if (known) return known
  const made = trip.legs.map((leg, i) => {
    const track = trackOf(leg)
    if (!track) return undefined
    const craft = crafts[track.craft]!
    const [before, after] = [trackOf(trip.legs[i - 1]), trackOf(trip.legs[i + 1])]
    const [from, to] = [center(leg.path[0]!), center(leg.path.at(-1)!)]
    const { path } = track
    const last = path.x.length - 1
    const walk = (station: Tile, n: number) =>
      between(station, { x: path.x[n]!, y: path.z[n]! }) / walkSpeed + craft.climb
    const span = legSeconds(leg) - rideBoardingSeconds
    const leaves = headingAt(path, 0)
    const stays = before?.craft === track.craft
    const alight = after?.craft === track.craft ? 0 : Math.min(span * 0.4, walk(to, last))
    return {
      track,
      from,
      to,
      leaves,
      docked: stays
        ? headingAt(before.path, before.path.length)
        : leaves + (craft.docksBowIn ? Math.PI : 0),
      board: stays ? 0 : Math.min(rideBoardingSeconds - turnSeconds - 1, walk(from, 0)),
      sails: span - alight,
      alight,
    }
  })
  plans.set(trip, made)
  return made
}

const smooth = (t: number) => t * t * (3 - 2 * t)
const turned = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from))
const cruised = (t: number) =>
  t < ramp
    ? (t * t) / (2 * ramp * (1 - ramp))
    : t > 1 - ramp
      ? 1 - ((1 - t) * (1 - t)) / (2 * ramp * (1 - ramp))
      : (t - ramp / 2) / (1 - ramp)

function step(
  ashore: Tile,
  aboard: Seat,
  progress: number,
  climb: number,
  boarding: boolean,
  seat: Seat,
) {
  const walked = Math.min(1, progress / (1 - climb))
  const lifted = climb > 0 ? Math.max(0, (progress - (1 - climb)) / climb) : 0
  seat.x = ashore.x + (aboard.x - ashore.x) * walked
  seat.y = ashore.y + (aboard.y - ashore.y) * walked
  const ground = surfaceAt(seat.x, seat.y)
  seat.height = ground + (aboard.height - ground) * lifted
  seat.heading = Math.atan2(aboard.x - ashore.x, aboard.y - ashore.y) + (boarding ? 0 : Math.PI)
  seat.walking = lifted === 0
}

const aboard: Seat = { x: 0, y: 0, height: 0, heading: 0, walking: false }

export function rideAt(trip: Route, leg: number, seconds: number, seat: Seat) {
  const plan = plansOf(trip)[leg]
  if (!plan) return false
  const { track, board, sails, alight } = plan
  const craft = crafts[track.craft]!
  const sailed = (seconds - rideBoardingSeconds) / sails
  sample(
    track.path,
    (sailed <= 0 ? 0 : sailed >= 1 ? 1 : cruised(sailed)) * track.path.length,
    pose,
  )
  if (sailed <= 0) {
    const turning = Math.max(0, 1 - (rideBoardingSeconds - seconds) / turnSeconds)
    pose.heading = plan.docked + turned(plan.docked, plan.leaves) * smooth(turning)
  }
  if (carriers.count < most) {
    const n = carriers.count++
    carriers.craft[n] = track.craft
    carriers.x[n] = pose.x
    carriers.y[n] = pose.y
    carriers.z[n] = pose.z
    carriers.heading[n] = pose.heading
    carriers.pitch[n] = pose.pitch
  }
  const [ax, ay] = [Math.cos(pose.heading), -Math.sin(pose.heading)]
  aboard.x = pose.x + ax * craft.ahead
  aboard.y = pose.z + ay * craft.ahead
  aboard.height = pose.y + craft.floor
  const left = seconds - rideBoardingSeconds - sails
  if (seconds < board) {
    step(plan.from, aboard, seconds / board, Math.min(0.9, craft.climb / board), true, seat)
  } else if (left > 0 && alight > 0) {
    step(plan.to, aboard, 1 - left / alight, Math.min(0.9, craft.climb / alight), false, seat)
  } else {
    seat.x = aboard.x
    seat.y = aboard.y
    seat.height = aboard.height
    seat.heading = Math.atan2(ax, ay)
    seat.walking = false
  }
  return true
}

const dummy = new Object3D()

function Fleet({ kind }: { kind: number }) {
  const body = useRef<InstancedMesh>(null)
  const glow = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    glow.current!.instanceMatrix = body.current!.instanceMatrix
  }, [])
  useFrame(() => {
    const [hulls, lit] = [body.current!, glow.current!]
    let n = 0
    for (let i = 0; i < carriers.count; i++) {
      if (carriers.craft[i] !== kind) continue
      dummy.position.set(carriers.x[i]!, carriers.y[i]!, carriers.z[i]!)
      dummy.rotation.set(0, carriers.heading[i]!, carriers.pitch[i]!, 'YZX')
      dummy.updateMatrix()
      hulls.setMatrixAt(n++, dummy.matrix)
    }
    hulls.count = n
    lit.count = n
    hulls.instanceMatrix.needsUpdate = true
    lit.visible = sky.daylight.value < 0.4
  })
  const craft = crafts[kind]!
  return (
    <>
      <instancedMesh ref={body} args={[craft.body, paint, most]} frustumCulled={false} castShadow />
      <instancedMesh ref={glow} args={[craft.lights, lamp, most]} frustumCulled={false} />
    </>
  )
}

export function Rides() {
  return crafts.map((_, kind) => <Fleet key={kind} kind={kind} />)
}
