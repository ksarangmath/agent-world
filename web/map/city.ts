import { groundKinds, mapHeight, mapWidth } from '../../shared/map/grid'
import { places, type Activity } from '../../shared/map/places'
import { accessRoad, roads } from '../../shared/map/route'
import { spots } from '../../shared/map/spots'
import { ground } from '../../shared/map/terrain'
import { hash, heightAt, noise } from './elevation'
import { reservedTiles } from './landmarks'
import {
  accents,
  neighborhoodAt,
  peaks,
  styles,
  type Crown,
  type Style,
  type Wild,
} from './neighborhoods'

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
  crown: Crown | 'none'
  crownHeight: number
}

export const treeKinds = ['round', 'cypress', 'pine', 'redwood', 'palm', 'oak', 'blossom'] as const
export type TreeKind = (typeof treeKinds)[number]
export type Tree = { x: number; y: number; base: number; size: number; kind: TreeKind }

const plazas: Record<Activity, string> = {
  coding: '#d6cff0',
  coffee: '#e8c29a',
  reading: '#ead9a8',
  music: '#c9a8e0',
  art: '#f2bfa8',
  climbing: '#b4c4d4',
  running: '#e07a55',
  hiking: '#c8a874',
  surfing: '#f7e3b0',
  sailing: '#b8946a',
  tinkering: '#c4bcb2',
  eating: '#f2c08a',
  chatting: '#dfc4b4',
  picnic: '#9bd66f',
  chess: '#e4ddcf',
  pitching: '#c8d4e4',
}

const roadColors = ['#4e5360', '#454a56', '#626774']
const pavement = '#d9d2c3'
const containerColors = ['#e8742c', '#2f6fbf', '#3d9970', '#c23a3a', '#f2b632', '#7b2cbf']

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
  const share = Math.min(1, Math.max(0, t))
  const channel = (shift: number) =>
    Math.round(((x >> shift) & 255) * (1 - share) + ((y >> shift) & 255) * share)
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

const wilds: Record<
  Wild,
  (x: number, y: number, clusters: number) => { color: string; chance: number; kinds: TreeKind[] }
> = {
  meadow: (_x, _y, clusters) => ({
    color: mix('#a6d36b', '#cfd97c', (clusters + 1) / 2),
    chance: 0.04 + Math.max(0, clusters) * 0.4,
    kinds: ['round', 'oak'],
  }),
  golden: (x, y, clusters) => ({
    color:
      clusters > 0.35
        ? mix('#e9c46a', '#9cbf55', (clusters - 0.35) * 1.6)
        : mix('#f4d06f', '#e2b24f', hash(x * 5, y * 3)),
    chance: 0.03 + Math.max(0, clusters) * 0.5,
    kinds: ['oak'],
  }),
  redwood: (_x, _y, clusters) => ({
    color: mix('#3f7d4a', '#5e9d55', (clusters + 1) / 2),
    chance: 0.3 + 0.3 * clusters,
    kinds: ['redwood', 'redwood', 'redwood', 'pine'],
  }),
  orchard: (x, y, clusters) =>
    clusters > -0.1
      ? {
          color: '#b8dd7a',
          chance: x % 3 === 0 && y % 2 === 0 ? 0.85 : 0,
          kinds: ['blossom'],
        }
      : { color: mix('#dcd27a', '#c9d86f', hash(x, y)), chance: 0.08, kinds: ['oak'] },
  dunes: (_x, _y, clusters) => ({
    color: mix('#efe0a6', '#c7d98a', (clusters + 1) / 2),
    chance: 0.06,
    kinds: ['cypress'],
  }),
}

type Lot = { x: number; y: number; width: number; depth: number; style: Style; name: string }

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
  const isRoad = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < mapWidth && y < mapHeight && roads[y * mapWidth + x]! > 0

  const block = new Int32Array(mapWidth * mapHeight).fill(-1)
  const lots: Lot[] = []
  const split = (id: number, lot: Lot, x1: number, y1: number) => {
    const { x: x0, y: y0, style } = lot
    const [width, depth] = [x1 - x0, y1 - y0]
    let count = 0
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) if (block[y * mapWidth + x] === id) count++
    }
    if (!count) return
    const [long, short] = styles[style].lot
    const fits = (width <= long && depth <= short) || (width <= short && depth <= long)
    if (count === width * depth && fits) {
      lots.push({ ...lot, width, depth })
      return
    }
    const cut = 0.35 + 0.3 * hash(x0 * 3 + y1, y0 * 7 + x1)
    if (width >= depth) {
      const at = x0 + Math.min(width - 1, Math.max(1, Math.round(width * cut)))
      split(id, lot, at, y1)
      split(id, { ...lot, x: at }, x1, y1)
    } else {
      const at = y0 + Math.min(depth - 1, Math.max(1, Math.round(depth * cut)))
      split(id, lot, x1, at)
      split(id, { ...lot, y: at }, x1, y1)
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
    split(id, { x: left, y: top, width: 0, depth: 0, style, name }, right + 1, bottom + 1)
  }

  const box = (
    x: number,
    y: number,
    width: number,
    depth: number,
    base: number,
    height: number,
    wall: string,
    roof = wall,
  ): Building => ({
    x,
    y,
    width,
    depth,
    base,
    height,
    wall,
    roof,
    gable: 'none',
    crown: 'none',
    crownHeight: 0,
  })

  const awning = (lot: Lot, base: number, color: string): Building | undefined => {
    const { x, y, width, depth } = lot
    const along = (from: number, to: number, test: (k: number) => boolean) => {
      for (let k = from; k < to; k++) if (test(k)) return true
      return false
    }
    const lift = base + 0.45
    if (along(x, x + width, (k) => isRoad(k, y - 1))) {
      return box(x + 0.15, y - 0.3, width - 0.3, 0.3, lift, 0.07, color)
    }
    if (along(x, x + width, (k) => isRoad(k, y + depth))) {
      return box(x + 0.15, y + depth, width - 0.3, 0.3, lift, 0.07, color)
    }
    if (along(y, y + depth, (k) => isRoad(x - 1, k))) {
      return box(x - 0.3, y + 0.15, 0.3, depth - 0.3, lift, 0.07, color)
    }
    if (along(y, y + depth, (k) => isRoad(x + width, k))) {
      return box(x + width, y + 0.15, 0.3, depth - 0.3, lift, 0.07, color)
    }
    return undefined
  }

  for (const lot of lots) {
    const { x, y, width, depth, style, name } = lot
    const kit = styles[style]
    const seed = hash(x * 7 + 1, y * 13 + 5)
    if (seed < kit.sparse) continue
    for (let dy = 0; dy < depth; dy++) {
      for (let dx = 0; dx < width; dx++) built[(y + dy) * mapWidth + x + dx] = 1
    }
    const [base, top] = cornerSpan(x, y, width, depth)
    const floor = base - 0.1
    const lift = top - base + 0.1
    const wall = pick(kit.walls, hash(x + 3, y + 17))
    const roof = pick(kit.roofs, hash(x + 29, y + 2))
    const [low, high] = kit.heights
    let height = low + (high - low) * hash(x, y * 3 + 11)

    if (kit.extra === 'containers' && hash(x + 13, y + 31) < 0.4) {
      for (let row = 0; row < depth; row++) {
        for (let column = 0; column < width; column++) {
          const stack = 1 + Math.floor(hash(x + column, y + row) * 2)
          for (let level = 0; level < stack; level++) {
            buildings.push(
              box(
                x + column + 0.05,
                y + row + 0.3,
                0.9,
                0.42,
                floor + lift + level * 0.42,
                0.42,
                pick(containerColors, hash(x + column * 3, y + row * 5 + level)),
              ),
            )
          }
        }
      }
      continue
    }

    if (kit.extra === 'tiers') {
      const center = neighborhoodAt(x, y)
      const falloff = Math.max(0, 1 - Math.sqrt((center.x - x) ** 2 + (center.y - y) ** 2) / 14)
      height = low + (high - low) * (peaks[name] ?? 0.3) * falloff ** 1.2 * (0.45 + 0.55 * seed)
      const levels: [inset: number, from: number, to: number][] =
        height > 5
          ? [
              [0, 0, 0.6],
              [0.18, 0.6, 0.85],
              [0.32, 0.85, 1],
            ]
          : [[0, 0, 1]]
      levels.forEach(([inset, from, to], level) => {
        const margin = inset * Math.min(width, depth)
        const tier = box(
          x + margin,
          y + margin,
          width - 2 * margin,
          depth - 2 * margin,
          floor + (level ? lift + height * from : 0),
          (level ? 0 : lift) + height * (to - from),
          wall,
          roof,
        )
        if (level === levels.length - 1 && height > 5 && seed > 0.55) {
          tier.crown = 'spire'
          tier.crownHeight = 1.5 + 2.5 * hash(x + 9, y + 9)
        }
        buildings.push(tier)
      })
      continue
    }

    const shape = pick(kit.tops, hash(x + 5, y + 41))
    const small = Math.max(width, depth) <= 3
    const building = box(x, y, width, depth, floor, lift + height, wall, roof)
    if (shape === 'gable' && small) building.gable = width >= depth ? 'x' : 'y'
    else if (shape !== 'flat' && shape !== 'gable') {
      building.crown = shape
      building.crownHeight =
        shape === 'dome'
          ? Math.min(width, depth) * 0.6
          : shape === 'hip'
            ? 0.3 + 0.12 * Math.min(width, depth)
            : shape === 'pagoda'
              ? 0.65
              : 0.4
    }
    buildings.push(building)
    const roofTop = floor + lift + height
    const flat = building.gable === 'none' && building.crown === 'none'

    if (kit.awnings.length && hash(x + 17, y + 3) < 0.7) {
      const canopy = awning(lot, floor + lift, pick(kit.awnings, hash(x + 2, y + 23)))
      if (canopy) buildings.push(canopy)
    }
    if (kit.extra === 'accent') {
      buildings.push(
        box(
          x - 0.02,
          y - 0.02,
          width + 0.04,
          depth + 0.04,
          roofTop - 0.32,
          0.24,
          pick(accents, hash(x + 41, y + 11)),
        ),
      )
    }
    if (kit.extra === 'gardens' && flat && hash(x + 43, y + 19) < 0.6) {
      buildings.push(
        box(x + 0.2, y + 0.2, width - 0.4, depth - 0.4, roofTop, 0.08, '#5aa845', '#6cc04a'),
      )
      for (let k = 0; k < Math.min(3, width * depth - 1); k++) {
        const [tx, ty] = [
          x + 0.4 + (width - 0.8) * hash(x + k, y + 7),
          y + 0.4 + (depth - 0.8) * hash(x + 7, y + k),
        ]
        trees.push({ x: tx, y: ty, base: roofTop + 0.08, size: 0.45, kind: 'round' })
      }
    } else if (flat && height > 1.6 && width * depth >= 4 && hash(x + 41, y + 7) < 0.4) {
      buildings.push(
        box(x + width / 2 - 0.3, y + depth / 2 - 0.3, 0.6, 0.6, roofTop, 0.3, '#9aa0a6', '#b4b9be'),
      )
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
      let kinds: readonly TreeKind[] = ['round']
      const plaza = plazaTiles.get(i)
      if (kind === 'ocean' || kind === 'water') color = '#2f6fa6'
      else if (roads[i]) color = roadColors[roads[i]! - 1]!
      else if (plaza) color = plazas[plaza]
      else if (walkways.has(i)) color = pavement
      else if (kind === 'sand') color = '#f5dfa8'
      else if (kind === 'park') {
        const { name } = styleAt(x, y)
        const woods = name === 'Presidio Woods'
        color = mix('#4fb548', '#86d16b', (clusters + 1) / 2)
        treeChance = woods ? 0.55 + 0.3 * clusters : 0.22 + 0.35 * clusters
        kinds = woods
          ? ['cypress', 'pine', 'pine']
          : ['round', 'round', 'cypress', 'pine', 'blossom', 'oak']
      } else if (kind === 'campus') {
        color = '#7ccc6a'
        treeChance = 0.18
        kinds = ['round', 'palm']
      } else if (built[i]) color = pavement
      else if (distance[i]! <= 8) {
        const kit = styles[styleAt(x, y).style]
        color = distance[i]! === 1 ? pavement : kit.lawn
        treeChance = distance[i]! === 1 ? 0.08 : 0.35
        kinds = kit.yard
      } else {
        const wild = wilds[styles[styleAt(x, y).style].wild](x, y, clusters)
        color = wild.color
        treeChance = wild.chance
        kinds = wild.kinds
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
          kind: pick(kinds, hash(x + 77, y + 33)),
        })
      }
    }
  }
  return { pixels, buildings, trees }
}

export type City = ReturnType<typeof buildCity>
