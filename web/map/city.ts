import { groundKinds, mapHeight, mapWidth } from '../../shared/map/grid'
import { places, type Activity } from '../../shared/map/places'
import { spots } from '../../shared/map/spots'
import { accessRoad, roads } from '../../shared/map/route'
import { ground } from '../../shared/map/terrain'
import { hash, heightAt, noise } from './elevation'
import { reservedTiles } from './landmarks'
import { neighborhoodAt, styles, type Style } from './neighborhoods'

export type Building = {
  x: number
  y: number
  width: number
  depth: number
  base: number
  height: number
  wall: string
  roof: string
  gable: 'none' | 'x' | 'y'
}

export const treeKinds = ['round', 'cypress', 'pine', 'redwood', 'palm'] as const
export type TreeKind = (typeof treeKinds)[number]
export type Tree = { x: number; y: number; base: number; size: number; kind: TreeKind }

const plazas: Record<Activity, string> = {
  coding: '#c9c3d6',
  coffee: '#d9b38c',
  reading: '#d8c9a0',
  music: '#b9a0c9',
  art: '#e3b6a0',
  climbing: '#a9b4bf',
  running: '#c97a5a',
  hiking: '#b59c6c',
  surfing: '#efdcae',
  sailing: '#a88a6a',
  tinkering: '#b3aca3',
  eating: '#e0b48a',
  chatting: '#cdb8a8',
  picnic: '#93c26f',
  chess: '#d6d0c4',
  pitching: '#bfc8d4',
}

const roadColors = ['#55575d', '#4a4c52', '#6f7074']

const peaks: Record<string, number> = {
  'Financial District': 1,
  'East Cut': 1,
  'Union Square': 0.55,
  Oakland: 0.45,
  'San Jose': 0.35,
}

const cellSizes: Record<Style, number> = {
  downtown: 2,
  midrise: 2,
  victorian: 1,
  stucco: 1,
  marina: 1,
  industrial: 3,
  suburb: 1,
  campus: 3,
}

const bayDepth = 0.14
const outward = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const

const kindAt = (i: number) => groundKinds[ground[i]!]!
const pick = <T>(list: readonly T[], seed: number) =>
  list[Math.floor(seed * list.length) % list.length]!

function toward(): { distance: Uint8Array; facing: Uint8Array } {
  const distance = new Uint8Array(mapWidth * mapHeight).fill(255)
  const facing = new Uint8Array(mapWidth * mapHeight)
  let frontier: number[] = []
  for (let i = 0; i < roads.length; i++) {
    if (roads[i]) {
      distance[i] = 0
      frontier.push(i)
    }
  }
  const moves = [
    [0, -1, 2],
    [1, 0, 3],
    [0, 1, 0],
    [-1, 0, 1],
  ] as const
  for (let d = 1; d <= 8 && frontier.length; d++) {
    const next: number[] = []
    for (const i of frontier) {
      const [x, y] = [i % mapWidth, Math.floor(i / mapWidth)]
      for (const [dx, dy, face] of moves) {
        const [nx, ny] = [x + dx, y + dy]
        if (nx < 0 || ny < 0 || nx >= mapWidth || ny >= mapHeight) continue
        const n = ny * mapWidth + nx
        const kind = kindAt(n)
        if (distance[n] !== 255 || kind === 'ocean' || kind === 'water') continue
        distance[n] = d
        facing[n] = face
        next.push(n)
      }
    }
    frontier = next
  }
  return { distance, facing }
}

function shade(hex: string, amount: number): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16)
  const scale = 1 + amount
  return [
    Math.min(255, ((value >> 16) & 255) * scale),
    Math.min(255, ((value >> 8) & 255) * scale),
    Math.min(255, (value & 255) * scale),
  ]
}

function mix(a: string, b: string, t: number): string {
  const [x, y] = [Number.parseInt(a.slice(1), 16), Number.parseInt(b.slice(1), 16)]
  const channel = (shift: number) =>
    Math.round(((x >> shift) & 255) * (1 - t) + ((y >> shift) & 255) * t)
  return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).padStart(6, '0')}`
}

function cornerSpan(x: number, y: number, width: number, depth: number): [number, number] {
  const corners = [
    heightAt(x, y),
    heightAt(x + width, y),
    heightAt(x, y + depth),
    heightAt(x + width, y + depth),
  ]
  return [Math.min(...corners), Math.max(...corners)]
}

export function buildCity() {
  const { distance, facing } = toward()
  const pixels = new Uint8Array(mapWidth * mapHeight * 4)
  const buildings: Building[] = []
  const trees: Tree[] = []
  const plazaTiles = new Map<number, Activity>()
  const walkways = new Set<number>()
  for (const place of places) {
    for (const spot of spots(place)) {
      plazaTiles.set(spot.y * mapWidth + spot.x, place.activity)
      const road = accessRoad(spot)
      const steps = 4 * Math.max(Math.abs(road.x - spot.x), Math.abs(road.y - spot.y))
      for (let k = 0; k <= steps; k++) {
        const t = steps ? k / steps : 0
        const [x, y] = [spot.x + 0.5 + (road.x - spot.x) * t, spot.y + 0.5 + (road.y - spot.y) * t]
        walkways.add(Math.floor(y) * mapWidth + Math.floor(x))
      }
    }
  }
  const built = new Uint8Array(mapWidth * mapHeight)
  const styleCache = new Map<number, { style: Style; name: string }>()
  const styleAt = (x: number, y: number) => {
    const key = Math.floor(y / 8) * mapWidth + Math.floor(x / 8)
    let found = styleCache.get(key)
    if (!found) {
      const neighborhood = neighborhoodAt(x, y)
      found = { style: neighborhood.style, name: neighborhood.name }
      styleCache.set(key, found)
    }
    return found
  }
  const buildable = (i: number, style: Style) => {
    const kind = kindAt(i)
    if (roads[i] || plazaTiles.has(i) || walkways.has(i) || built[i] || reservedTiles.has(i)) {
      return false
    }
    if (kind !== 'land' && !(kind === 'campus' && style === 'campus')) return false
    return distance[i]! <= styles[style].depth
  }

  for (let y = 0; y < mapHeight; y++) {
    for (let x = 0; x < mapWidth; x++) {
      const i = y * mapWidth + x
      const { style, name } = styleAt(x, y)
      const cell = cellSizes[style]
      if (x % cell || y % cell) continue
      const seed = hash(x * 7 + 1, y * 13 + 5)
      if (style === 'suburb' && seed > 0.55) continue
      const definition = styles[style]
      const [low, high] = definition.heights
      let height = low + (high - low) * hash(x, y * 3 + 11)
      if (style === 'downtown') {
        const center = neighborhoodAt(x, y)
        const falloff = Math.max(0, 1 - Math.sqrt((center.x - x) ** 2 + (center.y - y) ** 2) / 32)
        height = low + (high - low) * (peaks[name] ?? 0.3) * falloff ** 1.2 * (0.45 + 0.55 * seed)
      }
      const wall = pick(definition.walls, hash(x + 3, y + 17))
      const roof = pick(definition.roofs, hash(x + 29, y + 2))
      const whole =
        cell > 1 &&
        buildable(i, style) &&
        Array.from(
          { length: cell * cell },
          (_, k) => i + (k % cell) + Math.floor(k / cell) * mapWidth,
        ).every((tile) => (tile % mapWidth) - x < cell && buildable(tile, style))
      const footprints = whole
        ? [{ tx: x, ty: y, size: cell }]
        : Array.from({ length: cell * cell }, (_, k) => ({
            tx: x + (k % cell),
            ty: y + Math.floor(k / cell),
            size: 1,
          })).filter(
            ({ tx, ty }) => tx < mapWidth && ty < mapHeight && buildable(ty * mapWidth + tx, style),
          )
      for (const { tx, ty, size } of footprints) {
        for (let dy = 0; dy < size; dy++) {
          for (let dx = 0; dx < size; dx++) built[(ty + dy) * mapWidth + tx + dx] = 1
        }
        const [base, top] = cornerSpan(tx, ty, size, size)
        const streetRunsNorthSouth = facing[ty * mapWidth + tx]! % 2 === 1
        const ridgeAcrossStreet = style === 'victorian'
        const ridge = streetRunsNorthSouth === ridgeAcrossStreet ? 'x' : 'y'
        const gable = size === 1 && hash(tx + 5, ty + 41) < definition.gables ? ridge : 'none'
        const building: Building = {
          x: tx,
          y: ty,
          width: size,
          depth: size,
          base: base - 0.1,
          height: top - base + 0.1 + height * (size === 1 ? 0.92 + 0.16 * hash(tx, ty) : 1),
          wall,
          roof,
          gable,
        }
        buildings.push(building)
        const roofTop = building.base + building.height
        if (size === 1 && definition.gables > 0.3 && hash(tx + 11, ty + 23) < 0.6) {
          const [fx, fy] = outward[facing[ty * mapWidth + tx]!]!
          const [width, depth] = fx ? [bayDepth, 0.5] : [0.5, bayDepth]
          buildings.push({
            x: tx + 0.5 + fx * (0.5 + bayDepth / 2) - width / 2,
            y: ty + 0.5 + fy * (0.5 + bayDepth / 2) - depth / 2,
            width,
            depth,
            base: building.base,
            height: (roofTop - building.base) * 0.8,
            wall,
            roof: wall,
            gable: 'none',
          })
        } else if (gable === 'none' && height > 1.2 && hash(tx + 41, ty + 7) < 0.35) {
          buildings.push({
            x: tx + 0.15 + 0.4 * hash(tx + 3, ty),
            y: ty + 0.15 + 0.4 * hash(tx, ty + 3),
            width: 0.3,
            depth: 0.3,
            base: roofTop,
            height: 0.18,
            wall: '#9aa0a6',
            roof: '#b4b9be',
            gable: 'none',
          })
        }
      }
    }
  }

  for (let y = 0; y < mapHeight; y++) {
    for (let x = 0; x < mapWidth; x++) {
      const i = y * mapWidth + x
      const kind = kindAt(i)
      const grain = (hash(x * 31, y * 17) - 0.5) * (roads[i] ? 0.03 : 0.08)
      const clusters = noise(x / 7, y / 7)
      const seed = hash(x * 3 + 7, y * 5 + 3)
      let color: string
      let treeChance = 0
      let treeKinds: readonly TreeKind[] = ['round']
      const plaza = plazaTiles.get(i)
      if (kind === 'ocean' || kind === 'water') color = '#2f6fa6'
      else if (roads[i]) color = roadColors[roads[i]! - 1]!
      else if (plaza) color = plazas[plaza]
      else if (walkways.has(i)) color = '#cfc8bb'
      else if (kind === 'sand') color = '#ecd9a6'
      else if (kind === 'park') {
        const { name } = styleAt(x, y)
        color = mix('#5f9a4e', '#8cbf63', (clusters + 1) / 2)
        treeChance = name === 'Presidio' ? 0.55 + 0.3 * clusters : 0.22 + 0.35 * clusters
        treeKinds =
          name === 'Presidio' ? ['cypress', 'pine', 'pine'] : ['round', 'round', 'cypress', 'pine']
      } else if (kind === 'campus') {
        color = '#8fbf6e'
        treeChance = 0.18
        treeKinds = ['round', 'palm']
      } else if (built[i]) color = '#cfc8bb'
      else if (distance[i]! <= 6) {
        const { style } = styleAt(x, y)
        color = style === 'suburb' ? '#9cb873' : distance[i]! === 1 ? '#cfc8bb' : '#86a865'
        treeChance = distance[i]! === 1 ? 0.08 : 0.4
      } else {
        const lush = Math.max(0, clusters)
        color = mix('#cdb36f', '#7f9150', lush)
        treeChance = lush * 0.55
        const [cx] = [x / mapWidth]
        treeKinds = cx < 0.2 && y < 220 ? ['redwood', 'redwood', 'round'] : ['round']
      }
      const [r, g, b] = shade(color, grain)
      pixels.set([r, g, b, 255 - roads[i]! * 20], i * 4)
      if (treeChance > 0 && seed < treeChance && !reservedTiles.has(i) && !walkways.has(i)) {
        const [tx, ty] = [x + 0.25 + 0.5 * hash(x, y + 99), y + 0.25 + 0.5 * hash(x + 99, y)]
        trees.push({
          x: tx,
          y: ty,
          base: heightAt(tx, ty),
          size: 0.75 + 0.5 * hash(x + 5, y + 5),
          kind: pick(treeKinds, hash(x + 77, y + 33)),
        })
      }
    }
  }
  return { pixels, buildings, trees }
}

export type City = ReturnType<typeof buildCity>
