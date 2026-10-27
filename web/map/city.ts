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

const lotSizes: Record<Style, [long: number, short: number]> = {
  downtown: [4, 4],
  midrise: [4, 3],
  victorian: [3, 2],
  stucco: [2, 2],
  marina: [3, 3],
  industrial: [6, 5],
  suburb: [2, 2],
  campus: [5, 4],
}

const outward = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const

const kindAt = (i: number) => groundKinds[ground[i]!]!
const pick = <T>(list: readonly T[], seed: number) =>
  list[Math.floor(seed * list.length) % list.length]!

function roadDistances(): Uint8Array {
  const distance = new Uint8Array(mapWidth * mapHeight).fill(255)
  let frontier: number[] = []
  for (let i = 0; i < roads.length; i++) {
    if (roads[i]) {
      distance[i] = 0
      frontier.push(i)
    }
  }
  for (let d = 1; d <= 8 && frontier.length; d++) {
    const next: number[] = []
    for (const i of frontier) {
      const [x, y] = [i % mapWidth, Math.floor(i / mapWidth)]
      for (const [dx, dy] of outward) {
        const [nx, ny] = [x + dx, y + dy]
        if (nx < 0 || ny < 0 || nx >= mapWidth || ny >= mapHeight) continue
        const n = ny * mapWidth + nx
        const kind = kindAt(n)
        if (distance[n] !== 255 || kind === 'ocean' || kind === 'water') continue
        distance[n] = d
        next.push(n)
      }
    }
    frontier = next
  }
  return distance
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
  const distance = roadDistances()
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

  const block = new Int32Array(mapWidth * mapHeight).fill(-1)
  const lots: { x: number; y: number; width: number; depth: number; style: Style; name: string }[] =
    []
  const split = (
    id: number,
    style: Style,
    name: string,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ) => {
    const [width, depth] = [x1 - x0, y1 - y0]
    let count = 0
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) if (block[y * mapWidth + x] === id) count++
    }
    if (!count) return
    const [long, short] = lotSizes[style]
    const fits = (width <= long && depth <= short) || (width <= short && depth <= long)
    if (count === width * depth && fits) {
      lots.push({ x: x0, y: y0, width, depth, style, name })
      return
    }
    const cut = 0.35 + 0.3 * hash(x0 * 3 + y1, y0 * 7 + x1)
    if (width >= depth) {
      const at = x0 + Math.min(width - 1, Math.max(1, Math.round(width * cut)))
      split(id, style, name, x0, y0, at, y1)
      split(id, style, name, at, y0, x1, y1)
    } else {
      const at = y0 + Math.min(depth - 1, Math.max(1, Math.round(depth * cut)))
      split(id, style, name, x0, y0, x1, at)
      split(id, style, name, x0, at, x1, y1)
    }
  }
  let blocks = 0
  for (let start = 0; start < block.length; start++) {
    const [sx, sy] = [start % mapWidth, Math.floor(start / mapWidth)]
    const { style, name } = styleAt(sx, sy)
    if (block[start] !== -1 || !buildable(start, style)) continue
    const id = blocks++
    const tiles = [start]
    block[start] = id
    let [left, right, top, bottom] = [sx, sx, sy, sy]
    for (let k = 0; k < tiles.length; k++) {
      const [x, y] = [tiles[k]! % mapWidth, Math.floor(tiles[k]! / mapWidth)]
      ;[left, right, top, bottom] = [
        Math.min(left, x),
        Math.max(right, x),
        Math.min(top, y),
        Math.max(bottom, y),
      ]
      for (const [dx, dy] of outward) {
        const [nx, ny] = [x + dx, y + dy]
        const n = ny * mapWidth + nx
        if (nx < 0 || ny < 0 || nx >= mapWidth || ny >= mapHeight) continue
        if (block[n] !== -1 || !buildable(n, style)) continue
        block[n] = id
        tiles.push(n)
      }
    }
    split(id, style, name, left, top, right + 1, bottom + 1)
  }

  for (const { x, y, width, depth, style, name } of lots) {
    const definition = styles[style]
    const seed = hash(x * 7 + 1, y * 13 + 5)
    if (style === 'suburb' && seed > 0.6) continue
    for (let dy = 0; dy < depth; dy++) {
      for (let dx = 0; dx < width; dx++) built[(y + dy) * mapWidth + x + dx] = 1
    }
    const [low, high] = definition.heights
    let height = low + (high - low) * hash(x, y * 3 + 11)
    if (style === 'downtown') {
      const center = neighborhoodAt(x, y)
      const falloff = Math.max(0, 1 - Math.sqrt((center.x - x) ** 2 + (center.y - y) ** 2) / 14)
      height = low + (high - low) * (peaks[name] ?? 0.3) * falloff ** 1.2 * (0.45 + 0.55 * seed)
    }
    const [base, top] = cornerSpan(x, y, width, depth)
    const gable =
      Math.max(width, depth) <= 3 && hash(x + 5, y + 41) < definition.gables
        ? width >= depth
          ? 'x'
          : 'y'
        : 'none'
    const building: Building = {
      x,
      y,
      width,
      depth,
      base: base - 0.1,
      height: top - base + 0.1 + height,
      wall: pick(definition.walls, hash(x + 3, y + 17)),
      roof: pick(definition.roofs, hash(x + 29, y + 2)),
      gable,
    }
    buildings.push(building)
    if (gable === 'none' && height > 1.6 && width * depth >= 4 && hash(x + 41, y + 7) < 0.5) {
      buildings.push({
        x: x + width / 2 - 0.3,
        y: y + depth / 2 - 0.3,
        width: 0.6,
        depth: 0.6,
        base: building.base + building.height,
        height: 0.3,
        wall: '#9aa0a6',
        roof: '#b4b9be',
        gable: 'none',
      })
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
      else if (distance[i]! <= 8) {
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
