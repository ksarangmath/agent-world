import geography from '../../../shared/map/geography.json'
import { groundKinds, mapHeight, mapWidth, warp } from '../../../shared/map/grid'
import { roadClasses } from '../../../shared/map/route'
import { ground } from '../../../shared/map/terrain'

export type Span = 'goldenGate' | 'bayWest' | 'bayEast' | 'generic'

export type DeckPiece = {
  x: number
  y: number
  angle: number
  length: number
  width: number
  span: Span
  cap: number
  slope: number
  shoreX: number
  shoreY: number
  fromShore: number
  order: number
}

const profiles: Record<Span, { cap: number; slope: number; width?: number }> = {
  goldenGate: { cap: 4.5, slope: 6, width: 1.3 },
  bayWest: { cap: 3.6, slope: 0.9, width: 1.5 },
  bayEast: { cap: 2.6, slope: 0.6, width: 1.5 },
  generic: { cap: 1.2, slope: 0.4 },
}

const widths = { local: 0.7, street: 0.9, freeway: 1.2 }

export type Major = Exclude<Span, 'generic'>

export const axes: Record<Major, [number, number][]> = {
  goldenGate: [
    [-122.4776, 37.8108],
    [-122.4792, 37.8253],
  ],
  bayWest: [
    [-122.3873, 37.7895],
    [-122.3678, 37.8078],
  ],
  bayEast: [
    [-122.3592, 37.8149],
    [-122.3497, 37.8193],
    [-122.3283, 37.8222],
  ],
}

const warpedAxes = Object.entries(axes).map(
  ([span, points]) => [span as Major, points.map(([lon, lat]) => warp(lon, lat))] as const,
)

function distanceToAxis(x: number, y: number, points: [number, number][]) {
  let best = Infinity
  for (let i = 0; i + 1 < points.length; i++) {
    const [[ax, ay], [bx, by]] = [points[i]!, points[i + 1]!]
    const t = Math.max(
      0,
      Math.min(
        1,
        ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2),
      ),
    )
    best = Math.min(best, Math.sqrt((x - ax - t * (bx - ax)) ** 2 + (y - ay - t * (by - ay)) ** 2))
  }
  return best
}

const spanAt = (x: number, y: number, roadClass: (typeof roadClasses)[number]): Span =>
  (roadClass === 'freeway' &&
    warpedAxes.find(([, points]) => distanceToAxis(x, y, points) < 2.5)?.[0]) ||
  'generic'

export const wetAt = (x: number, y: number) => {
  const [tx, ty] = [Math.floor(x), Math.floor(y)]
  if (tx < 0 || ty < 0 || tx >= mapWidth || ty >= mapHeight) return false
  const kind = groundKinds[ground[ty * mapWidth + tx]!]
  return kind === 'ocean' || kind === 'water'
}

const sampleStep = 0.25
const piecesPerTile = 4

function samples(line: number[]): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = []
  for (let p = 0; p + 3 < line.length; p += 2) {
    const [x0, y0, x1, y1] = [line[p]!, line[p + 1]!, line[p + 2]!, line[p + 3]!]
    const count = Math.max(1, Math.ceil(Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2) / sampleStep))
    for (let s = p === 0 ? 0 : 1; s <= count; s++) {
      points.push({ x: x0 + ((x1 - x0) * s) / count, y: y0 + ((y1 - y0) * s) / count })
    }
  }
  return points
}

function wetRuns(points: { x: number; y: number }[]) {
  const runs: { x: number; y: number }[][] = []
  let start = -1
  points.forEach((point, i) => {
    const wet = wetAt(point.x, point.y)
    if (wet && start < 0) start = i
    if ((!wet || i === points.length - 1) && start >= 0) {
      runs.push(points.slice(Math.max(0, start - 1), Math.min(points.length, i + 1)))
      start = -1
    }
  })
  return runs.filter((run) => run.length > piecesPerTile)
}

function buildDecks(): DeckPiece[] {
  const runs = [...roadClasses]
    .reverse()
    .flatMap((roadClass) =>
      geography.roads[roadClass].flatMap((line) =>
        wetRuns(samples(line)).map((run) => ({ run, roadClass })),
      ),
    )
  const shores = runs.flatMap(({ run }) => [run[0]!, run.at(-1)!].filter((p) => !wetAt(p.x, p.y)))
  const taken = new Map<number, { x: number; y: number }[]>()
  const near = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const bucket = taken.get((Math.floor(y) + dy) * mapWidth + Math.floor(x) + dx)
        if (bucket?.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < 0.6)) return true
      }
    }
    return false
  }
  const pieces: DeckPiece[] = []
  for (const { run, roadClass } of runs) {
    for (let k = 0; k + 1 < run.length; k += piecesPerTile) {
      const [a, b] = [run[k]!, run[Math.min(run.length - 1, k + piecesPerTile)]!]
      const [x, y] = [(a.x + b.x) / 2, (a.y + b.y) / 2]
      if (near(x, y)) continue
      const key = Math.floor(y) * mapWidth + Math.floor(x)
      taken.set(key, [...(taken.get(key) ?? []), { x, y }])
      const span = spanAt(x, y, roadClass)
      const shore = shores.reduce((best, p) =>
        (p.x - x) ** 2 + (p.y - y) ** 2 < (best.x - x) ** 2 + (best.y - y) ** 2 ? p : best,
      )
      pieces.push({
        x,
        y,
        angle: Math.atan2(b.x - a.x, b.y - a.y),
        length: Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2) + 0.05,
        width: profiles[span].width ?? widths[roadClass],
        span,
        cap: profiles[span].cap,
        slope: profiles[span].slope,
        shoreX: shore.x,
        shoreY: shore.y,
        fromShore: Math.sqrt((shore.x - x) ** 2 + (shore.y - y) ** 2),
        order: k / piecesPerTile,
      })
    }
  }
  return pieces
}

export const deckPieces: DeckPiece[] = buildDecks()
