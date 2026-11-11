import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  MeshBasicMaterial,
  Matrix4,
  Object3D,
  type InstancedMesh,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import geography from '../../shared/map/geography.json'
import { warp } from '../../shared/map/grid'
import { onScreen, sky, useDetail } from './clock'
import { surfaceAt } from './decks'
import { hash } from './elevation'
import { chains } from './lines'
import { Fog } from './fog'
import { colored, toon } from './paint'
import { journey, roadEdges, rounded } from './roads'
import { skyloop } from './skyloop'

export type Pose = {
  x: number
  y: number
  z: number
  heading: number
  pitch: number
  scale: number
  stretch: number
}
export type Path = {
  x: Float64Array
  y?: Float64Array
  z: Float64Array
  at: Float64Array
  length: number
}
export type Fleet = {
  count: number
  model: BufferGeometry
  glow?: BufferGeometry
  colors?: readonly string[]
  place: (i: number, seconds: number, pose: Pose) => void
}

const epoch = Date.UTC(2026, 0, 1)
const paint = toon({ vertexColors: true })
const lamp = new MeshBasicMaterial({ vertexColors: true })
const pose: Pose = { x: 0, y: 0, z: 0, heading: 0, pitch: 0, scale: 1, stretch: 1 }
const dummy = new Object3D()
const hidden = new Matrix4().makeScale(0, 0, 0)

export const box = (
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  hex: string,
) => colored(new BoxGeometry(w, h, d).translate(x, y + h / 2, z), hex)

export function triangle(points: number[], hex: string) {
  const geometry = new BufferGeometry()
  const [a, b, c] = [points.slice(0, 3), points.slice(3, 6), points.slice(6, 9)]
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...b], 3),
  )
  geometry.setAttribute('uv', new Float32BufferAttribute(new Float32Array(12), 2))
  geometry.computeVertexNormals()
  return colored(geometry, hex)
}

export const model = (...parts: BufferGeometry[]) => mergeGeometries(parts)

const glass = '#27313d'
const wheels = (reach: number, half: number) =>
  [-1, 1].flatMap((fore) =>
    [-1, 1].map((side) => box(0.13, 0.09, 0.04, fore * reach, 0, side * half, '#17181c')),
  )
const beams = (reach: number, spread: number) =>
  [-1, 1].flatMap((side) => [
    box(0.02, 0.04, 0.07, reach, 0.08, side * spread, '#fff3c4'),
    box(0.02, 0.04, 0.07, -reach, 0.08, side * spread, '#ff3524'),
  ])
const sedan = [
  box(0.62, 0.1, 0.26, 0, 0.045, 0, '#ffffff'),
  box(0.3, 0.09, 0.22, -0.03, 0.145, 0, glass),
  box(0.26, 0.02, 0.2, -0.03, 0.235, 0, '#ffffff'),
  ...wheels(0.19, 0.125),
  ...beams(0.31, 0.08),
]

const models = {
  sedan: model(...sedan),
  sedanLights: model(...beams(0.315, 0.08)),
  taxi: model(
    ...sedan,
    box(0.5, 0.025, 0.265, 0, 0.085, 0, '#1c1c1f'),
    box(0.1, 0.045, 0.14, -0.03, 0.255, 0, '#fffbe8'),
  ),
  van: model(
    box(0.68, 0.2, 0.27, 0, 0.045, 0, '#ffffff'),
    box(0.03, 0.09, 0.24, 0.33, 0.14, 0, glass),
    box(0.16, 0.08, 0.275, 0.2, 0.15, 0, glass),
    ...wheels(0.21, 0.13),
    ...beams(0.34, 0.09),
  ),
  vanLights: model(...beams(0.345, 0.09)),
  bus: model(
    box(1.16, 0.21, 0.29, 0, 0.05, 0, '#ffffff'),
    box(1.06, 0.085, 0.295, 0, 0.15, 0, glass),
    box(1.1, 0.03, 0.27, 0, 0.26, 0, '#f1ecdf'),
    ...wheels(0.38, 0.14),
    ...beams(0.58, 0.1),
  ),
  busLights: model(...beams(0.585, 0.1), box(1.06, 0.085, 0.3, 0, 0.15, 0, '#ffd27a')),
  pod: model(
    box(0.5, 0.07, 0.26, 0, 0.13, 0, '#ffffff'),
    box(0.3, 0.08, 0.2, 0.03, 0.2, 0, '#8fe9ff'),
    box(0.16, 0.03, 0.36, -0.19, 0.15, 0, '#ffffff'),
    box(0.36, 0.025, 0.16, 0, 0.105, 0, '#35e0ff'),
  ),
  podLights: model(
    box(0.36, 0.025, 0.16, 0, 0.1, 0, '#35e0ff'),
    box(0.02, 0.03, 0.12, 0.25, 0.15, 0, '#ffffff'),
  ),
  cableCar: model(
    box(0.72, 0.14, 0.3, 0, 0.03, 0, '#7a2a22'),
    box(0.72, 0.1, 0.3, 0, 0.17, 0, '#e9dcb8'),
    box(0.6, 0.06, 0.31, 0, 0.19, 0, '#3a4a5a'),
    box(0.8, 0.04, 0.32, 0, 0.27, 0, '#5a2a20'),
  ),
  streetcar: model(
    box(1, 0.17, 0.3, 0, 0.03, 0, '#ffffff'),
    box(0.9, 0.07, 0.31, 0, 0.19, 0, '#3a4a5a'),
    box(1, 0.05, 0.3, 0, 0.26, 0, '#e8e2d2'),
    box(0.02, 0.18, 0.02, -0.2, 0.31, 0, '#2a2a2a'),
  ),
  tramWindows: model(box(0.9, 0.07, 0.32, 0, 0.19, 0, '#ffd27a')),
  ferry: model(
    box(3, 0.14, 0.9, 0, -0.08, 0, '#26313d'),
    box(3, 0.22, 0.9, 0, 0.06, 0, '#f2f2ee'),
    box(1.9, 0.32, 0.72, -0.1, 0.28, 0, '#f2f2ee'),
    box(1.92, 0.1, 0.74, -0.1, 0.4, 0, '#2e3d4d'),
    box(0.9, 0.22, 0.55, -0.2, 0.6, 0, '#e8e8e2'),
    box(0.12, 0.25, 0.12, -0.4, 0.82, 0, '#c23a2a'),
  ),
  ferryWindows: model(box(1.94, 0.1, 0.76, -0.1, 0.4, 0, '#ffd690')),
  sailboat: model(
    box(0.8, 0.12, 0.28, 0, 0, 0, '#f4f4f4'),
    box(0.04, 1, 0.04, 0.03, 0.12, 0, '#d9d9d9'),
    triangle([0.01, 0.18, 0, 0.01, 1.08, 0, -0.36, 0.18, 0], '#fbfbf6'),
    triangle([0.06, 0.95, 0, 0.38, 0.16, 0, 0.06, 0.16, 0], '#f1ebdc'),
  ),
  ship: model(
    box(8, 0.35, 1.3, 0, -0.15, 0, '#1f2329'),
    box(8, 0.3, 1.3, 0, 0.2, 0, '#8a2b22'),
    ...['#2f6fb0', '#c23a2a', '#e08a2c', '#3a8a5a', '#8a8f96', '#2aa0a0'].map((hex, i) =>
      box(0.9, 0.45 + 0.15 * (i % 2), 1.15, 2.9 - i, 0.5, 0, hex),
    ),
    box(0.9, 1, 1.1, -3.3, 0.5, 0, '#f2f2ee'),
    box(0.3, 0.4, 0.3, -3.5, 1.5, 0, '#c23a2a'),
  ),
  maglev: model(
    box(1.6, 0.3, 0.46, 0, 0.06, 0, '#f4f7fb'),
    box(0.2, 0.22, 0.38, 0.86, 0.06, 0, '#f4f7fb'),
    box(0.2, 0.22, 0.38, -0.86, 0.06, 0, '#f4f7fb'),
    box(1.3, 0.09, 0.47, 0, 0.21, 0, '#1f2b3a'),
    box(1.62, 0.04, 0.47, 0, 0.12, 0, '#19c6e6'),
    box(1.2, 0.04, 0.3, 0, 0.36, 0, '#dfe6ee'),
  ),
  maglevLights: model(
    box(1.3, 0.09, 0.48, 0, 0.21, 0, '#ffe9a8'),
    box(1.5, 0.03, 0.3, 0, 0.03, 0, '#49e6ff'),
  ),
  plane: model(
    box(4, 0.42, 0.42, 0, -0.21, 0, '#f4f4f4'),
    box(0.2, 0.08, 0.3, 1.85, 0.08, 0, '#2e3d4d'),
    box(0.9, 0.07, 3.8, 0.2, -0.08, 0, '#d9dde2'),
    box(0.5, 0.2, 0.2, 0.45, -0.28, 0.9, '#9aa0a6'),
    box(0.5, 0.2, 0.2, 0.45, -0.28, -0.9, '#9aa0a6'),
    box(0.6, 0.75, 0.07, -1.7, 0.18, 0, '#2f5fa8'),
    box(0.45, 0.06, 1.4, -1.75, 0.05, 0, '#d9dde2'),
  ),
  gull: model(
    box(0.14, 0.04, 0.04, 0, -0.02, 0, '#f6f6f2'),
    colored(new BoxGeometry(0.08, 0.015, 0.2).rotateX(0.35).translate(0, 0.03, -0.1), '#f6f6f2'),
    colored(new BoxGeometry(0.08, 0.015, 0.2).rotateX(-0.35).translate(0, 0.03, 0.1), '#f6f6f2'),
  ),
}

export function makePath(points: ArrayLike<number>, offset = 0, heights?: ArrayLike<number>): Path {
  const n = points.length / 2
  const x = Float64Array.from({ length: n }, (_, i) => points[i * 2]! + offset)
  const z = Float64Array.from({ length: n }, (_, i) => points[i * 2 + 1]! + offset)
  const at = new Float64Array(n)
  for (let i = 1; i < n; i++) at[i] = at[i - 1]! + Math.hypot(x[i]! - x[i - 1]!, z[i]! - z[i - 1]!)
  return { x, z, at, length: at[n - 1]!, y: heights ? Float64Array.from(heights) : undefined }
}

const lonLatPath = (stops: [lat: number, lon: number][]) =>
  makePath(stops.flatMap(([lat, lon]) => warp(lon, lat)))

export function sample(path: Path, distance: number, out: Pose) {
  const d = Math.max(0, Math.min(path.length, distance))
  let [low, high] = [0, path.at.length - 1]
  while (high - low > 1) {
    const middle = (low + high) >> 1
    if (path.at[middle]! <= d) low = middle
    else high = middle
  }
  const span = path.at[high]! - path.at[low]! || 1
  const t = (d - path.at[low]!) / span
  const [dx, dz] = [path.x[high]! - path.x[low]!, path.z[high]! - path.z[low]!]
  out.x = path.x[low]! + dx * t
  out.z = path.z[low]! + dz * t
  out.heading = Math.atan2(-dz, dx)
  if (path.y) {
    const dy = path.y[high]! - path.y[low]!
    out.y = path.y[low]! + dy * t
    out.pitch = Math.atan2(dy, span)
  }
}

function shuttle(
  seconds: number,
  length: number,
  speed: number,
  dwell: number,
  out: { distance: number; forward: boolean },
) {
  const travel = length / speed
  const period = 2 * (travel + dwell)
  const m = ((seconds % period) + period) % period
  out.forward = m < 2 * dwell + travel
  if (m < dwell) out.distance = 0
  else if (m < dwell + travel) out.distance = (m - dwell) * speed
  else if (m < 2 * dwell + travel) out.distance = length
  else out.distance = length - (m - 2 * dwell - travel) * speed
}

const leg = { distance: 0, forward: true }

function onRoad(path: Path, distance: number, forward: boolean, lane: number, out: Pose) {
  sample(path, distance, out)
  if (!forward) out.heading += Math.PI
  const [sin, cos] = [Math.sin(out.heading), Math.cos(out.heading)]
  out.x += sin * lane
  out.z += cos * lane
  out.y = surfaceAt(out.x, out.z)
  const front = surfaceAt(out.x + cos * 0.25, out.z - sin * 0.25)
  const back = surfaceAt(out.x - cos * 0.25, out.z + sin * 0.25)
  out.pitch = Math.atan2(front - back, 0.5)
}

function clipped(lines: number[][], keep: (x: number, z: number) => boolean) {
  return lines.flatMap((line) => {
    const pieces: number[][] = [[]]
    const visit = (x: number, z: number) => {
      if (keep(x, z)) pieces.at(-1)!.push(x, z)
      else if (pieces.at(-1)!.length) pieces.push([])
    }
    for (let i = 0; i + 3 < line.length; i += 2) {
      const [x0, z0, x1, z1] = [line[i]!, line[i + 1]!, line[i + 2]!, line[i + 3]!]
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 2))
      for (let step = 0; step < steps; step++) {
        visit(x0 + ((x1 - x0) * step) / steps, z0 + ((z1 - z0) * step) / steps)
      }
    }
    visit(line.at(-2)!, line.at(-1)!)
    return pieces.filter((piece) => piece.length >= 4)
  })
}

const [fidiX, fidiZ] = warp(-122.3999, 37.7946)
const sanFrancisco = [
  [-122.53, 37.7],
  [-122.35, 37.84],
].map(([lon, lat]) => warp(lon!, lat!))
const insideSanFrancisco = (x: number, z: number) =>
  x > sanFrancisco[0]![0] &&
  x < sanFrancisco[1]![0] &&
  z > sanFrancisco[1]![1] &&
  z < sanFrancisco[0]![1]

const carColors = [
  '#f2f2f2',
  '#c0c4c8',
  '#2b2d31',
  '#7d8288',
  '#b8322f',
  '#2f5fa8',
  '#2f5a44',
  '#d9c9a3',
  '#f2c230',
  '#e8e8e0',
  '#8a2a2a',
  '#4d6e8f',
]
const roadTraffic = {
  local: { density: 0.014, speed: 2.4 },
  street: { density: 0.014, speed: 3.2 },
  freeway: { density: 0.014, speed: 5.5 },
}
const journeyTiles = 150
const laneOffset = 0.19
const roadScale = 1.3
const steerSpan = 0.18
const vehicles = [
  { share: 0.5, model: 'sedan', glow: 'sedanLights', colors: carColors, pace: 1, hover: 0 },
  { share: 0.12, model: 'taxi', glow: 'sedanLights', colors: ['#f7c531'], pace: 1.05, hover: 0 },
  {
    share: 0.13,
    model: 'van',
    glow: 'vanLights',
    colors: ['#f4f4f0', '#3fb8af', '#ff7a59', '#5b6ee1'],
    pace: 0.9,
    hover: 0,
  },
  {
    share: 0.1,
    model: 'bus',
    glow: 'busLights',
    colors: ['#e2483d', '#2f7fd8', '#35a56a', '#f0932b'],
    pace: 0.75,
    hover: 0,
  },
  {
    share: 0.15,
    model: 'pod',
    glow: 'podLights',
    colors: ['#ffffff', '#b8f2e6', '#ffa69e', '#cdb4ff'],
    pace: 1.35,
    hover: 0.1,
  },
] as const

const [behind, ahead]: [Pose, Pose] = [{ ...pose }, { ...pose }]

function circuit(path: Path, lane: number, travelled: number, out: Pose) {
  const turn = Math.PI * lane
  const lap = 2 * (path.length + turn)
  const along = ((travelled % lap) + lap) % lap
  const returning = along >= path.length + turn
  const leg = returning ? along - path.length - turn : along
  if (leg < path.length) {
    const distance = returning ? path.length - leg : leg
    sample(path, distance - steerSpan, behind)
    sample(path, distance + steerSpan, ahead)
    sample(path, distance, out)
    out.heading = Math.atan2(behind.z - ahead.z, ahead.x - behind.x) + (returning ? Math.PI : 0)
    out.x += Math.sin(out.heading) * lane
    out.z += Math.cos(out.heading) * lane
  } else {
    sample(path, returning ? 0 : path.length, out)
    const facing = out.heading + (returning ? Math.PI : 0)
    const swing = (leg - path.length) / lane
    const [sin, cos] = [Math.sin(facing), Math.cos(facing)]
    out.x += lane * (sin * Math.cos(swing) + cos * Math.sin(swing))
    out.z += lane * (cos * Math.cos(swing) - sin * Math.sin(swing))
    out.heading = facing + swing
  }
  const [sin, cos] = [Math.sin(out.heading), Math.cos(out.heading)]
  out.y = surfaceAt(out.x, out.z)
  const front = surfaceAt(out.x + cos * 0.25, out.z - sin * 0.25)
  const back = surfaceAt(out.x - cos * 0.25, out.z + sin * 0.25)
  out.pitch = Math.atan2(front - back, 0.5)
  out.scale = roadScale
}

function cars(): Fleet[] {
  const span = (line: number[]) => makePath(line).length
  const drivers = roadEdges
    .flatMap(({ line, roadClass }, n) => {
      const middle = Math.floor(line.length / 4) * 2
      const [mx, mz] = [line[middle]!, line[middle + 1]!]
      const downtown = Math.max(0, 1 - Math.hypot(mx - fidiX, mz - fidiZ) / 45)
      const expected =
        span(line) *
        roadTraffic[roadClass].density *
        (1 + 3 * downtown) *
        (insideSanFrancisco(mx, mz) ? 1 : 0.5)
      return Array.from({ length: Math.floor(expected + hash(n, 11)) }, (_, i) => {
        let pick = hash(n + 5, i + 9)
        return {
          path: makePath(journey(n, n * 131 + i, journeyTiles), 0.5),
          speed: roadTraffic[roadClass].speed * (0.85 + 0.3 * hash(n, i + 7)),
          phase: hash(i, n),
          vehicle: vehicles.findIndex(({ share }) => (pick -= share) < 0),
        }
      })
    })
    .filter((driver) => driver.path.length > 6)
  return vehicles.map((vehicle, v) => {
    const mine = drivers.filter((driver) => driver.vehicle === v)
    return {
      count: mine.length,
      model: models[vehicle.model],
      glow: models[vehicle.glow],
      colors: mine.map(
        (_, i) => vehicle.colors[Math.floor(hash(i, v + 3) * vehicle.colors.length)]!,
      ),
      place: (i, seconds, out) => {
        const driver = mine[i]!
        const travelled =
          seconds * driver.speed * vehicle.pace + driver.phase * 2 * driver.path.length
        circuit(driver.path, laneOffset, travelled, out)
        if (vehicle.hover) out.y += vehicle.hover + 0.025 * Math.sin(seconds * 3 + i)
      },
    }
  })
}

type Track = { name: keyof typeof geography.named; count: number; eastOf?: number }

function tracks(names: Track[], speed: number) {
  return names.flatMap(({ name, count, eastOf }) =>
    chains(clipped(geography.named[name], (x) => eastOf === undefined || x >= eastOf))
      .map((line) => makePath(rounded(line), 0.5))
      .filter((path) => path.length > 8)
      .flatMap((path, n) =>
        Array.from({ length: count }, (_, i) => ({
          path,
          speed,
          phase: ((i + 0.3 * hash(n, i)) * 2 * path.length) / count,
        })),
      ),
  )
}

function railCars(
  lines: ReturnType<typeof tracks>,
  model: BufferGeometry,
  glow: BufferGeometry,
  colors?: string[],
): Fleet {
  return {
    count: lines.length,
    model,
    glow,
    colors: colors && lines.map((_, i) => colors[i % colors.length]!),
    place: (i, seconds, out) => {
      const line = lines[i]!
      shuttle(seconds + line.phase / line.speed, line.path.length, line.speed, 12, leg)
      onRoad(line.path, leg.distance, leg.forward, 0.05, out)
    },
  }
}

const ferryLanes: [lat: number, lon: number][][] = [
  [
    [37.7962, -122.3905],
    [37.806, -122.386],
    [37.818, -122.412],
    [37.84, -122.45],
    [37.8565, -122.478],
  ],
  [
    [37.7962, -122.3905],
    [37.8, -122.36],
    [37.797, -122.33],
    [37.7955, -122.315],
    [37.7945, -122.307],
    [37.7935, -122.295],
    [37.7945, -122.2785],
  ],
  [
    [37.7962, -122.3905],
    [37.806, -122.386],
    [37.83, -122.41],
    [37.85, -122.452],
    [37.866, -122.452],
    [37.872, -122.455],
  ],
  [
    [37.8105, -122.403],
    [37.818, -122.412],
    [37.8245, -122.4195],
  ],
]

const shippingLane: [number, number][] = [
  [37.795, -122.56],
  [37.812, -122.52],
  [37.8195, -122.4785],
  [37.818, -122.44],
  [37.812, -122.405],
  [37.8, -122.376],
  [37.798, -122.35],
  [37.797, -122.33],
  [37.7955, -122.315],
]

const anchorages: [lat: number, lon: number, rx: number, rz: number, boats: number][] = [
  [37.8095, -122.44, 6, 2.5, 5],
  [37.852, -122.468, 4, 3, 4],
  [37.822, -122.43, 6, 4, 5],
  [37.816, -122.38, 3, 2.5, 3],
  [37.87, -122.49, 3, 2.5, 3],
]

function boats(): Fleet[] {
  const ferries = ferryLanes.flatMap((stops, n) => {
    const path = lonLatPath(stops)
    return [0, 0.5].map((offset) => ({ path, offset: offset + 0.13 * n }))
  })
  const ships = [0, 0.33, 0.66].map((offset) => ({ path: lonLatPath(shippingLane), offset }))
  const sailboats = anchorages.flatMap(([lat, lon, rx, rz, count], n) => {
    const [cx, cz] = warp(lon, lat)
    return Array.from({ length: count }, (_, i) => ({
      cx,
      cz,
      rx: rx * (0.6 + 0.4 * hash(n, i)),
      rz: rz * (0.6 + 0.4 * hash(i, n)),
      speed: (0.04 + 0.03 * hash(n + 9, i)) * (i % 2 ? 1 : -1),
      phase: hash(n * 3, i * 5) * Math.PI * 2,
    }))
  })
  const sail = (
    path: Path,
    seconds: number,
    speed: number,
    dwell: number,
    offset: number,
    out: Pose,
  ) => {
    const period = 2 * (path.length / speed + dwell)
    shuttle(seconds + offset * period, path.length, speed, dwell, leg)
    sample(path, leg.distance, out)
    if (!leg.forward) out.heading += Math.PI
    out.y = 0
  }
  return [
    {
      count: ferries.length,
      model: models.ferry,
      glow: models.ferryWindows,
      place: (i, seconds, out) => sail(ferries[i]!.path, seconds, 5, 25, ferries[i]!.offset, out),
    },
    {
      count: ships.length,
      model: models.ship,
      place: (i, seconds, out) => sail(ships[i]!.path, seconds, 2.5, 60, ships[i]!.offset, out),
    },
    {
      count: sailboats.length,
      model: models.sailboat,
      place: (i, seconds, out) => {
        const boat = sailboats[i]!
        const angle = boat.phase + seconds * boat.speed
        out.x = boat.cx + boat.rx * Math.cos(angle)
        out.z = boat.cz + boat.rz * Math.sin(angle)
        out.y = 0
        out.heading = Math.atan2(
          -boat.rz * Math.cos(angle) * boat.speed,
          -boat.rx * Math.sin(angle) * boat.speed,
        )
        out.pitch = 0.08 * Math.sin(seconds * 1.3 + boat.phase)
      },
    },
  ]
}

const express = { trains: 5, cars: 6, spacing: 1.78, cruise: 13, push: 5, dwell: 9, float: 0.1 }

function maglev(): Fleet {
  const { count, x, y, z, stations } = skyloop
  const ring = [...Array(count).keys(), 0]
  const path = makePath(
    ring.flatMap((i) => [x[i]!, z[i]!]),
    0,
    ring.map((i) => y[i]!),
  )
  const stops = stations.map((i) => path.at[i]!).sort((a, b) => a - b)
  let clock = 0
  const legs = stops.map((from, k) => {
    const run = (stops[k + 1] ?? stops[0]! + path.length) - from
    const peak = Math.min(express.cruise, Math.sqrt(express.push * run))
    const ramp = peak / express.push
    const leg = { from, run, peak, ramp, takes: run / peak + ramp, departs: clock + express.dwell }
    clock = leg.departs + leg.takes
    return leg
  })
  const period = clock
  const reached = (seconds: number) => {
    const moment = ((seconds % period) + period) % period
    const leg = legs.findLast((candidate) => moment >= candidate.departs - express.dwell)!
    const moving = moment - leg.departs
    if (moving <= 0) return leg.from
    const coasting = leg.takes - leg.ramp
    if (moving < leg.ramp) return leg.from + (express.push * moving * moving) / 2
    if (moving < coasting)
      return leg.from + (leg.peak * leg.ramp) / 2 + leg.peak * (moving - leg.ramp)
    return leg.from + leg.run - (express.push * (leg.takes - moving) ** 2) / 2
  }
  return {
    count: express.trains * express.cars,
    model: models.maglev,
    glow: models.maglevLights,
    place: (i, seconds, out) => {
      const train = Math.floor(i / express.cars)
      const head = reached(seconds + (train * period) / express.trains)
      const at = head - (i % express.cars) * express.spacing
      sample(path, ((at % path.length) + path.length) % path.length, out)
      out.y += express.float
    },
  }
}

function planes(): Fleet {
  const [east, west] = [warp(-122.3577, 37.6136), warp(-122.3934, 37.6286)]
  const [south, north] = [warp(-122.3815, 37.6061), warp(-122.3705, 37.627)]
  const beyond = ([ax, az]: number[], [bx, bz]: number[], distance: number) => {
    const length = Math.hypot(bx! - ax!, bz! - az!)
    return [bx! + ((bx! - ax!) / length) * distance, bz! + ((bz! - az!) / length) * distance]
  }
  const approach = beyond(west, east, 70)
  const climb = beyond(south, north, 80)
  const landing = makePath([...approach, ...east, ...west], 0, [16, 0.55, 0.55])
  const takeoff = makePath([...south, ...north, ...climb], 0, [0.55, 0.55, 22])
  const flights = [
    { path: landing, offset: 0, speed: 9 },
    { path: landing, offset: 32, speed: 9 },
    { path: takeoff, offset: 14, speed: 8 },
    { path: takeoff, offset: 46, speed: 8 },
  ]
  return {
    count: flights.length,
    model: models.plane,
    place: (i, seconds, out) => {
      const flight = flights[i]!
      const elapsed = (seconds + flight.offset) % 64
      const distance = elapsed * flight.speed
      sample(flight.path, distance, out)
      out.scale = distance > flight.path.length ? 0 : 1
    },
  }
}

const colonies: [lat: number, lon: number][] = [
  [37.8085, -122.415],
  [37.799, -122.3965],
  [37.765, -122.512],
  [37.857, -122.478],
  [37.8267, -122.423],
  [37.806, -122.465],
  [37.787, -122.507],
  [37.7945, -122.279],
]

function gulls(): Fleet {
  const birds = colonies.flatMap(([lat, lon], n) => {
    const [cx, cz] = warp(lon, lat)
    return Array.from({ length: 6 }, (_, i) => ({
      cx: cx + (hash(n, i) - 0.5) * 3,
      cz: cz + (hash(i, n) - 0.5) * 3,
      radius: 1 + 2 * hash(n + 4, i),
      height: 2.5 + 2.5 * hash(n, i + 4),
      speed: (0.4 + 0.5 * hash(n + 2, i + 2)) * (i % 2 ? 1 : -1),
      phase: hash(n * 7, i * 3) * Math.PI * 2,
    }))
  })
  return {
    count: birds.length,
    model: models.gull,
    place: (i, seconds, out) => {
      const bird = birds[i]!
      const angle = bird.phase + seconds * bird.speed
      out.x = bird.cx + bird.radius * Math.cos(angle)
      out.z = bird.cz + bird.radius * Math.sin(angle)
      out.y = bird.height + 0.3 * Math.sin(seconds * 0.7 + bird.phase)
      out.heading = Math.atan2(-Math.cos(angle) * bird.speed, -Math.sin(angle) * bird.speed)
      out.stretch = 1 + 1.2 * Math.sin(seconds * 9 + bird.phase)
    },
  }
}

export function Vehicles({ fleet }: { fleet: Fleet }) {
  const body = useRef<InstancedMesh>(null)
  const glow = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = body.current!
    if (fleet.colors) {
      const color = new Color()
      fleet.colors.forEach((hex, i) => mesh.setColorAt(i, color.set(hex)))
      mesh.instanceColor!.needsUpdate = true
    }
    if (glow.current) glow.current.instanceMatrix = mesh.instanceMatrix
  }, [fleet])
  useFrame(() => {
    const mesh = body.current!
    const seconds = (Date.now() - epoch) / 1000
    for (let i = 0; i < fleet.count; i++) {
      pose.heading = 0
      pose.pitch = 0
      pose.scale = 1
      pose.stretch = 1
      fleet.place(i, seconds, pose)
      if (!onScreen(pose.x, pose.z)) {
        mesh.setMatrixAt(i, hidden)
        continue
      }
      dummy.position.set(pose.x, pose.y, pose.z)
      dummy.rotation.set(0, pose.heading, pose.pitch, 'YZX')
      dummy.scale.set(pose.scale, pose.scale * pose.stretch, pose.scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (glow.current) glow.current.visible = sky.daylight.value < 0.4
  })
  return (
    <>
      <instancedMesh
        ref={body}
        args={[fleet.model, paint, fleet.count]}
        frustumCulled={false}
        castShadow={useDetail()}
      />
      {fleet.glow && (
        <instancedMesh ref={glow} args={[fleet.glow, lamp, fleet.count]} frustumCulled={false} />
      )}
    </>
  )
}

const vintage = ['#e8742c', '#3f7a4a', '#f0c43a', '#c23a3a', '#e9e2cf', '#2f6a8a']

export function Traffic() {
  const fleets = useMemo(
    () => [
      ...cars(),
      railCars(
        tracks(
          [
            { name: 'Powell St', count: 2 },
            { name: 'Hyde St', count: 2 },
            { name: 'California St', count: 2, eastOf: warp(-122.4225, 37.79)[0] },
          ],
          1.4,
        ),
        models.cableCar,
        models.tramWindows,
      ),
      railCars(
        tracks(
          [
            { name: 'Market St', count: 3 },
            { name: 'The Embarcadero', count: 3 },
          ],
          2.2,
        ),
        models.streetcar,
        models.tramWindows,
        vintage,
      ),
      ...boats(),
      maglev(),
      planes(),
      gulls(),
    ],
    [],
  )
  return (
    <>
      {fleets.map((fleet, i) => (
        <Vehicles key={i} fleet={fleet} />
      ))}
      <Fog />
    </>
  )
}
