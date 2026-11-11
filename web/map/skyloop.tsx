import { useLayoutEffect, useRef } from 'react'
import {
  BoxGeometry,
  CatmullRomCurve3,
  Color,
  MeshBasicMaterial,
  Object3D,
  Vector3,
  type InstancedMesh,
} from 'three'
import { mapWidth } from '../../shared/map/grid'
import { heightAt } from './elevation'
import { toon } from './paint'

const clearance = 2.6
const liftOver = 6
const easeOver = 9
const corridor = 0.8

const stops: readonly [x: number, y: number, station?: string][] = [
  [243, 184, 'Ferry Plaza'],
  [262, 179],
  [304, 183],
  [328, 181, 'Oaktown'],
  [353, 203],
  [370, 241, 'Coliseum'],
  [394, 300],
  [407, 354, 'Fremont Flats'],
  [407, 408],
  [392, 439, 'San José'],
  [348, 437, 'Mountain View'],
  [322, 431, 'Palo Alto'],
  [265, 404],
  [226, 398, 'Millbrae'],
  [217, 370],
  [229, 320],
  [237, 215, 'King Street'],
  [242, 198],
]

const curve = new CatmullRomCurve3(
  stops.map(([x, y]) => new Vector3(x, 0, y)),
  true,
  'centripetal',
)
const count = Math.round(curve.getLength())
const spaced = curve.getSpacedPoints(count).slice(0, count)
const wrap = (i: number) => ((i % count) + count) % count
const over = (values: number[], reach: number, pick: (window: number[]) => number) =>
  values.map((_, i) =>
    pick(Array.from({ length: reach * 2 + 1 }, (_, k) => values[wrap(i + k - reach)]!)),
  )
const ground = spaced.map(({ x, z }) => Math.max(0, heightAt(x, z)))
const lifted = over(ground, liftOver, (window) => Math.max(...window))
const eased = over(
  lifted,
  easeOver,
  (window) => window.reduce((sum, v) => sum + v, 0) / window.length,
)

export const skyloop = {
  count,
  x: spaced.map((point) => point.x),
  z: spaced.map((point) => point.z),
  y: eased.map((height) => height + clearance),
  ground,
  stations: stops
    .filter(([, , station]) => station)
    .map(([x, y]) => {
      let nearest = 0
      spaced.forEach((point, i) => {
        const best = spaced[nearest]!
        if (Math.hypot(point.x - x, point.z - y) < Math.hypot(best.x - x, best.z - y)) nearest = i
      })
      return nearest
    }),
}

export const skyloopTiles: ReadonlySet<number> = new Set(
  spaced.flatMap(({ x, z }) =>
    [-corridor, 0, corridor].flatMap((dx) =>
      [-corridor, 0, corridor].map((dz) => Math.floor(z + dz) * mapWidth + Math.floor(x + dx)),
    ),
  ),
)

type Beam = {
  x: number
  y: number
  z: number
  size: [length: number, height: number, width: number]
  heading: number
  pitch: number
  color: string
}

const deck = { width: 0.72, depth: 0.16, color: '#eef2f6' }
const pylon = { every: 5, width: 0.24, color: '#c5cfda' }
const canopies = ['#ff7a59', '#3fd0c9', '#ffd166', '#b28dff']
const railGlow = '#49e6ff'
const box = new BoxGeometry(1, 1, 1)
const solid = toon()
const glowing = new MeshBasicMaterial()

function beams(): { solids: Beam[]; glows: Beam[] } {
  const [solids, glows]: [Beam[], Beam[]] = [[], []]
  const { count, x, y, z, ground, stations } = skyloop
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count
    const [dx, dy, dz] = [x[j]! - x[i]!, y[j]! - y[i]!, z[j]! - z[i]!]
    const run = Math.hypot(dx, dz)
    const span = {
      x: (x[i]! + x[j]!) / 2,
      z: (z[i]! + z[j]!) / 2,
      heading: Math.atan2(-dz, dx),
      pitch: Math.atan2(dy, run),
    }
    const top = (y[i]! + y[j]!) / 2
    solids.push({
      ...span,
      y: top - deck.depth / 2,
      size: [run + 0.04, deck.depth, deck.width],
      color: deck.color,
    })
    glows.push({ ...span, y: top + 0.02, size: [run + 0.04, 0.04, 0.12], color: railGlow })
    if (i % pylon.every === 0) {
      const foot = ground[i]! - 0.6
      solids.push({
        ...span,
        x: x[i]!,
        z: z[i]!,
        pitch: 0,
        y: (foot + y[i]! - deck.depth) / 2,
        size: [pylon.width, y[i]! - deck.depth - foot, pylon.width],
        color: pylon.color,
      })
    }
  }
  stations.forEach((i, n) => {
    const j = (i + 1) % count
    const heading = Math.atan2(-(z[j]! - z[i]!), x[j]! - x[i]!)
    const at = { x: x[i]!, z: z[i]!, heading, pitch: 0 }
    solids.push(
      { ...at, y: y[i]! - deck.depth - 0.05, size: [9, 0.14, 2.2], color: '#f3efe4' },
      { ...at, y: y[i]! + 1.05, size: [8.4, 0.1, 2.4], color: canopies[n % canopies.length]! },
      { ...at, y: y[i]! + 1.14, size: [7.6, 0.08, 1.2], color: '#fff7e6' },
    )
    for (const along of [-3.6, -1.2, 1.2, 3.6]) {
      for (const side of [-1, 1]) {
        solids.push({
          ...at,
          x: at.x + Math.cos(heading) * along + Math.sin(heading) * side,
          z: at.z - Math.sin(heading) * along + Math.cos(heading) * side,
          y: y[i]! + 0.5,
          size: [0.08, 1.1, 0.08],
          color: '#dfe6ee',
        })
      }
    }
    glows.push({ ...at, y: y[i]! + 0.98, size: [8.4, 0.05, 2.44], color: '#ffe9a8' })
  })
  return { solids, glows }
}

function Beams({ list, glow }: { list: Beam[]; glow?: boolean }) {
  const mesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const dummy = new Object3D()
    const color = new Color()
    list.forEach((beam, i) => {
      dummy.position.set(beam.x, beam.y, beam.z)
      dummy.rotation.set(0, beam.heading, beam.pitch, 'YZX')
      dummy.scale.set(...beam.size)
      dummy.updateMatrix()
      mesh.current!.setMatrixAt(i, dummy.matrix)
      mesh.current!.setColorAt(i, color.set(beam.color))
    })
    mesh.current!.instanceMatrix.needsUpdate = true
    mesh.current!.instanceColor!.needsUpdate = true
    mesh.current!.computeBoundingSphere()
  }, [list])
  return (
    <instancedMesh
      ref={mesh}
      args={[box, glow ? glowing : solid, list.length]}
      castShadow={!glow}
      receiveShadow={!glow}
    />
  )
}

const { solids, glows } = beams()

export function Skyloop() {
  return (
    <>
      <Beams list={solids} />
      <Beams list={glows} glow />
    </>
  )
}
