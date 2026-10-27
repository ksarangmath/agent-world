import { groundKinds, mapHeight, mapWidth, warp } from '../../shared/map/grid'
import { roads } from '../../shared/map/route'
import { ground, isDry } from '../../shared/map/terrain'
import { deckPieces } from './landmarks/bridges'

export const vertexStep = 2
export const columns = mapWidth / vertexStep + 1
export const rows = Math.ceil(mapHeight / vertexStep) + 1
export const shoreHeight = 0.08
const landHeight = 0.3
const seabedHeight = -1.2

const hills: [lat: number, lon: number, height: number, radiusKm: number][] = [
  [37.7544, -122.4477, 5.5, 0.9],
  [37.7383, -122.4542, 5, 0.7],
  [37.7585, -122.4583, 4.5, 0.6],
  [37.742, -122.437, 3.5, 0.6],
  [37.756, -122.472, 3.5, 0.6],
  [37.748, -122.464, 3, 0.6],
  [37.7682, -122.4413, 3, 0.35],
  [37.765, -122.438, 2.5, 0.25],
  [37.793, -122.4161, 2.5, 0.45],
  [37.8011, -122.4194, 2.25, 0.4],
  [37.8024, -122.4058, 2.25, 0.25],
  [37.7925, -122.4382, 2.25, 0.8],
  [37.779, -122.452, 1.75, 0.3],
  [37.743, -122.4146, 2.5, 0.5],
  [37.7604, -122.4005, 1.75, 0.5],
  [37.718, -122.42, 2.5, 0.8],
  [37.715, -122.44, 2, 0.5],
  [37.795, -122.465, 2, 0.7],
  [37.785, -122.505, 1.5, 0.4],
  [37.728, -122.375, 1.5, 0.5],
  [37.8105, -122.3637, 2, 0.4],
  [37.8267, -122.423, 0.75, 0.15],
  [37.8613, -122.4316, 4, 0.9],
  [37.786, -122.392, 0.75, 0.2],
  [37.6855, -122.4333, 6.5, 2.2],
  [37.615, -122.46, 6, 2.5],
  [37.555, -122.48, 8, 3.5],
  [37.47, -122.33, 7.5, 4],
  [37.38, -122.22, 9, 6],
  [37.405, -122.18, 3, 2],
  [37.28, -122.07, 9, 6],
  [37.9235, -122.5965, 12, 3.5],
  [37.905, -122.56, 7, 2.5],
  [37.827, -122.499, 4.5, 1.4],
  [37.835, -122.53, 5, 1.8],
  [37.86, -122.5, 4, 1.4],
  [37.91, -122.49, 3, 1.1],
  [37.885, -122.46, 2.5, 0.9],
  [37.87, -122.57, 5, 2],
  [37.885, -122.235, 7.5, 2.8],
  [37.91, -122.26, 6, 2],
  [37.82, -122.19, 7, 3.5],
  [37.75, -122.12, 6, 4],
  [37.66, -122.05, 6, 4],
  [37.512, -121.88, 9, 4],
  [37.895, -122.305, 1.25, 0.4],
  [37.85, -122.08, 7, 5],
  [37.38, -121.75, 9, 6],
]

export const hash = (x: number, y: number) => {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export function noise(x: number, y: number) {
  const [ix, iy] = [Math.floor(x), Math.floor(y)]
  const [fx, fy] = [x - ix, y - iy]
  const [sx, sy] = [fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)]
  const top = hash(ix, iy) + (hash(ix + 1, iy) - hash(ix, iy)) * sx
  const bottom = hash(ix, iy + 1) + (hash(ix + 1, iy + 1) - hash(ix, iy + 1)) * sx
  return (top + (bottom - top) * sy) * 2 - 1
}

const dryAt = (x: number, y: number) =>
  x >= 0 &&
  y >= 0 &&
  x < mapWidth &&
  y < mapHeight &&
  isDry(groundKinds[ground[y * mapWidth + x]!]!)

const coastFade = 6

function distancesFrom(source: (i: number) => boolean): Uint8Array {
  const distance = new Uint8Array(mapWidth * mapHeight).fill(255)
  let frontier: number[] = []
  for (let i = 0; i < distance.length; i++) {
    if (source(i)) {
      distance[i] = 0
      frontier.push(i)
    }
  }
  for (let d = 1; d < 32 && frontier.length; d++) {
    const next: number[] = []
    for (const i of frontier) {
      const [x, y] = [i % mapWidth, Math.floor(i / mapWidth)]
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ] as const) {
        const n = ny * mapWidth + nx
        if (nx >= 0 && ny >= 0 && nx < mapWidth && ny < mapHeight && distance[n] === 255) {
          distance[n] = d
          next.push(n)
        }
      }
    }
    frontier = next
  }
  return distance
}

const dryTile = (i: number) => isDry(groundKinds[ground[i]!]!)

export const shoreDistance: Uint8Array = distancesFrom(dryTile)
const inland = distancesFrom((i) => !dryTile(i))

function heightGrid(): Float32Array {
  const raised = new Float32Array(columns * rows)
  for (const [lat, lon, height, radiusKm] of hills) {
    const [cx, cy] = warp(lon, lat)
    const [ex] = warp(lon + 0.01, lat)
    const radius = (radiusKm * Math.abs(ex - cx)) / 0.88
    const [left, right] = [
      Math.max(0, Math.floor((cx - radius) / vertexStep)),
      Math.min(columns - 1, Math.ceil((cx + radius) / vertexStep)),
    ]
    const [top, bottom] = [
      Math.max(0, Math.floor((cy - radius) / vertexStep)),
      Math.min(rows - 1, Math.ceil((cy + radius) / vertexStep)),
    ]
    for (let row = top; row <= bottom; row++) {
      for (let column = left; column <= right; column++) {
        const t = ((column * vertexStep - cx) ** 2 + (row * vertexStep - cy) ** 2) / radius ** 2
        if (t < 1) raised[row * columns + column]! += height * (1 - t) ** 2
      }
    }
  }
  const heights = new Float32Array(columns * rows)
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const [x, y] = [column * vertexStep, row * vertexStep]
      const dry = [dryAt(x - 1, y - 1), dryAt(x, y - 1), dryAt(x - 1, y), dryAt(x, y)].filter(
        Boolean,
      ).length
      const hill = raised[row * columns + column]!
      const rugged =
        hill * (1 + 0.3 * noise(x / 9, y / 9)) + 0.15 * noise(x / 4, y / 4) * Math.min(1, hill)
      const coast = Math.min(
        1,
        inland[Math.min(y, mapHeight - 1) * mapWidth + Math.min(x, mapWidth - 1)]! / coastFade,
      )
      heights[row * columns + column] =
        dry === 4 ? landHeight + Math.max(0, rugged) * coast : dry > 0 ? shoreHeight : seabedHeight
    }
  }
  return heights
}

export const heights: Float32Array = heightGrid()

export function heightAt(x: number, y: number): number {
  const [gx, gy] = [
    Math.max(0, Math.min(columns - 1.001, x / vertexStep)),
    Math.max(0, Math.min(rows - 1.001, y / vertexStep)),
  ]
  const [column, row] = [Math.floor(gx), Math.floor(gy)]
  const [fx, fy] = [gx - column, gy - row]
  const at = (c: number, r: number) => heights[r * columns + c]!
  const top = at(column, row) + (at(column + 1, row) - at(column, row)) * fx
  const bottom = at(column, row + 1) + (at(column + 1, row + 1) - at(column, row + 1)) * fx
  return top + (bottom - top) * fy
}

export const decks = deckPieces.map((piece) => ({
  ...piece,
  height: Math.min(
    piece.cap,
    Math.max(heightAt(piece.shoreX, piece.shoreY), shoreHeight) + piece.slope * piece.fromShore,
  ),
}))

const deckTiles = new Map<number, number>()
for (const deck of decks) {
  const [ax, ay] = [Math.sin(deck.angle), Math.cos(deck.angle)]
  for (const along of [-0.5, 0, 0.5]) {
    for (const across of [-0.6, 0, 0.6]) {
      const [x, y] = [
        deck.x + ax * along * deck.length + ay * across,
        deck.y + ay * along * deck.length - ax * across,
      ]
      const key = Math.floor(y) * mapWidth + Math.floor(x)
      deckTiles.set(key, Math.max(deckTiles.get(key) ?? 0, deck.height))
    }
  }
}

export function deckHeight(x: number, y: number): number | undefined {
  const [tx, ty] = [Math.floor(x), Math.floor(y)]
  if (tx < 0 || ty < 0 || tx >= mapWidth || ty >= mapHeight) return undefined
  const i = ty * mapWidth + tx
  if (!roads[i] || shoreDistance[i] === 0) return undefined
  return deckTiles.get(i) ?? 0.8
}

export const surfaceAt = (x: number, y: number) =>
  deckHeight(x, y) ?? Math.max(heightAt(x, y), shoreHeight)
