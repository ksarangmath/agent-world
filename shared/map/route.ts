export const mapWidth = 256
export const mapHeight = 192
export const walkTilesPerSecond = 0.6
export const rideTilesPerSecond = 4
export const rideBoardingSeconds = 30

export type Tile = { x: number; y: number }
export type Leg = { mode: 'walk' | 'ride'; path: Tile[] }
export type Route = { legs: Leg[]; seconds: number }

type Point = readonly [number, number]

export const roads: readonly (readonly Point[])[] = [
  [
    [60, 80],
    [136, 80],
  ],
  [
    [32, 89],
    [117, 89],
  ],
  [
    [94, 95],
    [136, 95],
  ],
  [
    [32, 110],
    [136, 110],
  ],
  [
    [32, 127],
    [132, 127],
  ],
  [
    [32, 84],
    [32, 127],
  ],
  [
    [58, 36],
    [58, 127],
  ],
  [
    [94, 80],
    [94, 127],
  ],
  [
    [117, 70],
    [117, 127],
  ],
  [
    [136, 80],
    [136, 118],
  ],
  [
    [117, 127],
    [118, 150],
    [140, 172],
    [160, 180],
  ],
  [
    [150, 180],
    [244, 180],
  ],
  [
    [58, 47],
    [104, 47],
  ],
  [
    [42, 36],
    [58, 36],
  ],
  [
    [42, 24],
    [42, 36],
  ],
  [
    [136, 84],
    [214, 84],
  ],
  [
    [190, 40],
    [190, 120],
  ],
  [
    [190, 58],
    [234, 58],
  ],
  [
    [230, 34],
    [230, 58],
  ],
  [
    [190, 98],
    [212, 98],
  ],
  [
    [190, 120],
    [244, 120],
  ],
  [
    [244, 120],
    [244, 180],
  ],
]

export const rides: readonly { name: string; from: Point; to: Point }[] = [
  { name: 'Bay Rail', from: [117, 110], to: [190, 98] },
  { name: 'Peninsula Rail', from: [136, 118], to: [176, 180] },
  { name: 'Sausalito ferry', from: [136, 89], to: [104, 47] },
  { name: 'Oakland ferry', from: [136, 89], to: [190, 98] },
]

const index = (x: number, y: number) => y * mapWidth + x
const tileOf = (i: number): Tile => ({ x: i % mapWidth, y: Math.floor(i / mapWidth) })
const squaredDistance = (a: Tile, b: Tile) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2
const distance = (a: Tile, b: Tile) => Math.sqrt(squaredDistance(a, b))

function line([x0, y0]: Point, [x1, y1]: Point): Tile[] {
  const tiles: Tile[] = []
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let [x, y, error] = [x0, y0, dx + dy]
  for (;;) {
    tiles.push({ x, y })
    if (x === x1 && y === y1) return tiles
    const doubled = 2 * error
    if (doubled >= dy) {
      error += dy
      x += sx
    }
    if (doubled <= dx) {
      error += dx
      y += sy
    }
  }
}

export const roadTiles: ReadonlySet<number> = new Set(
  roads
    .flatMap((road) => road.slice(1).flatMap((end, i) => line(road[i]!, end)))
    .map((t) => index(t.x, t.y)),
)

const rideLinks = new Map<number, { to: number; seconds: number }[]>()
for (const ride of rides) {
  const [a, b] = [index(...ride.from), index(...ride.to)]
  const seconds = rideBoardingSeconds + distance(tileOf(a), tileOf(b)) / rideTilesPerSecond
  rideLinks.set(a, [...(rideLinks.get(a) ?? []), { to: b, seconds }])
  rideLinks.set(b, [...(rideLinks.get(b) ?? []), { to: a, seconds }])
}

const sortedRoadTiles = [...roadTiles].sort((a, b) => a - b)

function nearestRoadTile(tile: Tile): number {
  let best = sortedRoadTiles[0]!
  for (const candidate of sortedRoadTiles) {
    if (squaredDistance(tile, tileOf(candidate)) < squaredDistance(tile, tileOf(best)))
      best = candidate
  }
  return best
}

function neighbors(i: number): { to: number; seconds: number; ride: boolean }[] {
  const { x, y } = tileOf(i)
  const result: { to: number; seconds: number; ride: boolean }[] = []
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const [nx, ny] = [x + dx, y + dy]
      if ((dx || dy) && nx >= 0 && ny >= 0 && nx < mapWidth && ny < mapHeight) {
        const n = index(nx, ny)
        if (roadTiles.has(n))
          result.push({
            to: n,
            seconds: Math.sqrt(dx * dx + dy * dy) / walkTilesPerSecond,
            ride: false,
          })
      }
    }
  }
  for (const link of rideLinks.get(i) ?? []) result.push({ ...link, ride: true })
  return result
}

type Entry = readonly [cost: number, tile: number]
const before = (a: Entry, b: Entry) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])

function push(heap: Entry[], entry: Entry) {
  heap.push(entry)
  for (let i = heap.length - 1; i > 0;) {
    const parent = (i - 1) >> 1
    if (!before(heap[i]!, heap[parent]!)) break
    ;[heap[i], heap[parent]] = [heap[parent]!, heap[i]!]
    i = parent
  }
}

function pop(heap: Entry[]): Entry {
  const top = heap[0]!
  const last = heap.pop()!
  if (heap.length > 0) {
    heap[0] = last
    for (let i = 0; ;) {
      const [l, r] = [2 * i + 1, 2 * i + 2]
      let smallest = i
      if (l < heap.length && before(heap[l]!, heap[smallest]!)) smallest = l
      if (r < heap.length && before(heap[r]!, heap[smallest]!)) smallest = r
      if (smallest === i) break
      ;[heap[i], heap[smallest]] = [heap[smallest]!, heap[i]!]
      i = smallest
    }
  }
  return top
}

function shortestPath(start: number, goal: number): { tiles: number[]; rides: Set<number> } {
  const seconds = new Map([[start, 0]])
  const previous = new Map<number, { from: number; ride: boolean }>()
  const queue: Entry[] = [[0, start]]
  const done = new Set<number>()
  while (queue.length > 0) {
    const [cost, current] = pop(queue)
    if (done.has(current)) continue
    done.add(current)
    if (current === goal) break
    for (const edge of neighbors(current)) {
      const next = cost + edge.seconds
      if (next < (seconds.get(edge.to) ?? Infinity)) {
        seconds.set(edge.to, next)
        previous.set(edge.to, { from: current, ride: edge.ride })
        push(queue, [next, edge.to])
      }
    }
  }
  if (!done.has(goal)) throw new Error(`no road route between tiles ${start} and ${goal}`)
  const tiles = [goal]
  const rideEnds = new Set<number>()
  for (let step = previous.get(goal); step; step = previous.get(step.from)) {
    if (step.ride) rideEnds.add(tiles[tiles.length - 1]!)
    tiles.push(step.from)
  }
  return { tiles: tiles.reverse(), rides: rideEnds }
}

function simplify(path: Tile[]): Tile[] {
  return path.filter((tile, i) => {
    const [before, after] = [path[i - 1], path[i + 1]]
    if (!before || !after) return true
    return tile.x - before.x !== after.x - tile.x || tile.y - before.y !== after.y - tile.y
  })
}

export const legSeconds = (leg: Leg) => {
  const tiles = leg.path.slice(1).reduce((sum, tile, i) => sum + distance(leg.path[i]!, tile), 0)
  return leg.mode === 'walk'
    ? tiles / walkTilesPerSecond
    : rideBoardingSeconds + tiles / rideTilesPerSecond
}

export function route(from: Tile, to: Tile): Route {
  if (from.x === to.x && from.y === to.y) return { legs: [], seconds: 0 }
  const [start, goal] = [nearestRoadTile(from), nearestRoadTile(to)]
  const { tiles, rides: rideEnds } = shortestPath(start, goal)
  const legs: Leg[] = []
  let walk: Tile[] = [from]
  tiles.forEach((i, n) => {
    const tile = tileOf(i)
    if (rideEnds.has(i) && n > 0) {
      legs.push({ mode: 'walk', path: simplify(walk) })
      legs.push({ mode: 'ride', path: [tileOf(tiles[n - 1]!), tile] })
      walk = [tile]
    } else {
      walk.push(tile)
    }
  })
  walk.push(to)
  legs.push({ mode: 'walk', path: simplify(walk) })
  const nonEmpty = legs.filter((leg) => leg.path.length > 1)
  return { legs: nonEmpty, seconds: nonEmpty.reduce((sum, leg) => sum + legSeconds(leg), 0) }
}
