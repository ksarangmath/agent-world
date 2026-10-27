import geography from './geography.json'
import { mapHeight, mapWidth, warp } from './grid'

export const walkTilesPerSecond = 1
export const rideTilesPerSecond = 6
export const rideBoardingSeconds = 30

export type Tile = { x: number; y: number }
export type Leg = { mode: 'walk' | 'ride'; path: Tile[] }
export type Route = { legs: Leg[]; seconds: number }

export const roadClasses = ['local', 'street', 'freeway'] as const
export type RoadClass = (typeof roadClasses)[number]

const index = (x: number, y: number) => y * mapWidth + x
const tileOf = (i: number): Tile => ({ x: i % mapWidth, y: Math.floor(i / mapWidth) })
const squaredDistance = (a: Tile, b: Tile) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2
const distance = (a: Tile, b: Tile) => Math.sqrt(squaredDistance(a, b))
const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < mapWidth && y < mapHeight

function line(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  visit: (x: number, y: number) => void,
) {
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let [x, y, error] = [x0, y0, dx + dy]
  for (;;) {
    visit(x, y)
    if (x === x1 && y === y1) return
    const doubled = 2 * error
    const [stepX, stepY] = [doubled >= dy, doubled <= dx]
    if (stepX) {
      error += dy
      x += sx
    }
    if (stepX && stepY) visit(x, y)
    if (stepY) {
      error += dx
      y += sy
    }
  }
}

function rasterize(): Uint8Array {
  const grid = new Uint8Array(mapWidth * mapHeight)
  roadClasses.forEach((roadClass, i) => {
    for (const road of geography.roads[roadClass]) {
      for (let p = 0; p + 3 < road.length; p += 2) {
        line(road[p]!, road[p + 1]!, road[p + 2]!, road[p + 3]!, (x, y) => {
          if (inside(x, y)) grid[index(x, y)] = i + 1
        })
      }
    }
  })
  return grid
}

export const roads: Uint8Array = rasterize()

export const roadAt = (x: number, y: number): RoadClass | undefined =>
  inside(x, y) ? roadClasses[roads[index(x, y)]! - 1] : undefined

function nearest(tile: Tile, candidates: number[]): number {
  let best = candidates[0]!
  let bestDistance = Infinity
  for (const candidate of candidates) {
    const d = squaredDistance(tile, tileOf(candidate))
    if (d < bestDistance) [best, bestDistance] = [candidate, d]
  }
  return best
}

const roadTiles: number[] = []
roads.forEach((road, i) => road && roadTiles.push(i))

const at = (lon: number, lat: number): Tile => {
  const [x, y] = warp(lon, lat)
  return tileOf(nearest({ x: Math.round(x), y: Math.round(y) }, roadTiles))
}

const stations = {
  embarcadero: at(-122.3968, 37.7929),
  westOakland: at(-122.2951, 37.8048),
  fourthAndKing: at(-122.3947, 37.7766),
  millbrae: at(-122.3867, 37.6003),
  paloAlto: at(-122.1649, 37.4434),
  mountainView: at(-122.076, 37.3947),
  sanJose: at(-121.9026, 37.3297),
  ferryBuilding: at(-122.3937, 37.7955),
  sausalito: at(-122.4778, 37.8568),
  jackLondon: at(-122.2777, 37.795),
}

export const ferryTerminal: Tile = stations.ferryBuilding

export const rides: readonly { name: string; from: Tile; to: Tile }[] = [
  { name: 'Bay Rail', from: stations.embarcadero, to: stations.westOakland },
  { name: 'Peninsula Rail', from: stations.fourthAndKing, to: stations.millbrae },
  { name: 'Peninsula Rail', from: stations.millbrae, to: stations.paloAlto },
  { name: 'Peninsula Rail', from: stations.paloAlto, to: stations.mountainView },
  { name: 'Peninsula Rail', from: stations.mountainView, to: stations.sanJose },
  { name: 'Sausalito ferry', from: stations.ferryBuilding, to: stations.sausalito },
  { name: 'Oakland ferry', from: stations.ferryBuilding, to: stations.jackLondon },
]

const rideLinks = new Map<number, { to: number; seconds: number }[]>()
for (const ride of rides) {
  const [a, b] = [index(ride.from.x, ride.from.y), index(ride.to.x, ride.to.y)]
  const seconds = rideBoardingSeconds + distance(ride.from, ride.to) / rideTilesPerSecond
  rideLinks.set(a, [...(rideLinks.get(a) ?? []), { to: b, seconds }])
  rideLinks.set(b, [...(rideLinks.get(b) ?? []), { to: a, seconds }])
}

const steps = [-1, 0, 1].flatMap((dy) =>
  [-1, 0, 1]
    .filter((dx) => dx || dy)
    .map((dx) => ({ dx, dy, seconds: Math.sqrt(dx * dx + dy * dy) / walkTilesPerSecond })),
)

function connections(i: number, visit: (next: number, seconds: number, ride: boolean) => void) {
  const { x, y } = tileOf(i)
  for (const step of steps) {
    const [nx, ny] = [x + step.dx, y + step.dy]
    if (inside(nx, ny) && roads[index(nx, ny)]) visit(index(nx, ny), step.seconds, false)
  }
  for (const link of rideLinks.get(i) ?? []) visit(link.to, link.seconds, true)
}

function reachableFrom(start: Tile): Uint8Array {
  const seen = new Uint8Array(mapWidth * mapHeight)
  const stack = [index(start.x, start.y)]
  seen[stack[0]!] = 1
  while (stack.length > 0) {
    connections(stack.pop()!, (next) => {
      if (seen[next]) return
      seen[next] = 1
      stack.push(next)
    })
  }
  return seen
}

const routable = reachableFrom(ferryTerminal)

export function accessRoad(tile: Tile): Tile {
  let best = -1
  let bestDistance = Infinity
  for (let radius = 0; radius * radius <= bestDistance && radius < mapWidth; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      const step = Math.abs(dy) === radius ? 1 : 2 * radius
      for (let dx = -radius; dx <= radius; dx += step || 1) {
        const [x, y] = [tile.x + dx, tile.y + dy]
        if (!inside(x, y) || !routable[index(x, y)]) continue
        const d = dx * dx + dy * dy
        const i = index(x, y)
        if (d < bestDistance || (d === bestDistance && i < best)) [best, bestDistance] = [i, d]
      }
    }
  }
  return tileOf(best)
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

const costs = new Float64Array(mapWidth * mapHeight).fill(Infinity)
const previous = new Int32Array(mapWidth * mapHeight).fill(-1)
const rode = new Uint8Array(mapWidth * mapHeight)
const settled = new Uint8Array(mapWidth * mapHeight)

function shortestPath(start: number, goal: number): { tiles: number[]; rides: Set<number> } {
  const touched = [start]
  const queue: Entry[] = [[0, start]]
  costs[start] = 0
  try {
    while (queue.length > 0) {
      const [cost, current] = pop(queue)
      if (settled[current]) continue
      settled[current] = 1
      if (current === goal) break
      connections(current, (next, seconds, ride) => {
        if (cost + seconds >= costs[next]!) return
        if (costs[next] === Infinity) touched.push(next)
        costs[next] = cost + seconds
        previous[next] = current
        rode[next] = ride ? 1 : 0
        push(queue, [cost + seconds, next])
      })
    }
    if (!settled[goal]) throw new Error(`no road route between tiles ${start} and ${goal}`)
    const tiles = [goal]
    const rideEnds = new Set<number>()
    for (let tile = goal; tile !== start; tile = previous[tile]!) {
      if (rode[tile]) rideEnds.add(tile)
      tiles.push(previous[tile]!)
    }
    return { tiles: tiles.reverse(), rides: rideEnds }
  } finally {
    for (const tile of touched) {
      costs[tile] = Infinity
      previous[tile] = -1
      rode[tile] = 0
      settled[tile] = 0
    }
  }
}

function straighten(path: Tile[]): Tile[] {
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
  const [startTile, goalTile] = [accessRoad(from), accessRoad(to)]
  const [start, goal] = [index(startTile.x, startTile.y), index(goalTile.x, goalTile.y)]
  const { tiles, rides: rideEnds } = shortestPath(start, goal)
  const legs: Leg[] = []
  let walk: Tile[] = [from]
  tiles.forEach((i, n) => {
    const tile = tileOf(i)
    if (rideEnds.has(i) && n > 0) {
      legs.push({ mode: 'walk', path: straighten(walk) })
      legs.push({ mode: 'ride', path: [tileOf(tiles[n - 1]!), tile] })
      walk = [tile]
    } else {
      walk.push(tile)
    }
  })
  walk.push(to)
  legs.push({ mode: 'walk', path: straighten(walk) })
  const nonEmpty = legs.filter((leg) => leg.path.length > 1)
  return { legs: nonEmpty, seconds: nonEmpty.reduce((sum, leg) => sum + legSeconds(leg), 0) }
}

export type Position = { x: number; y: number; mode: Leg['mode']; heading: number }

function along(path: Tile[], fraction: number): { x: number; y: number; heading: number } {
  const lengths = path.slice(1).map((tile, i) => distance(path[i]!, tile))
  let remaining = Math.max(0, Math.min(1, fraction)) * lengths.reduce((sum, l) => sum + l, 0)
  for (let i = 0; i < lengths.length; i++) {
    const length = lengths[i]!
    const [a, b] = [path[i]!, path[i + 1]!]
    if (remaining <= length && length > 0) {
      const t = remaining / length
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        heading: Math.atan2(b.x - a.x, b.y - a.y),
      }
    }
    remaining -= length
  }
  return { ...path.at(-1)!, heading: 0 }
}

export function positionOnRoute(trip: Route, elapsedSeconds: number): Position {
  let remaining = elapsedSeconds
  for (const leg of trip.legs) {
    const seconds = legSeconds(leg)
    if (remaining < seconds) {
      const moving = leg.mode === 'ride' ? remaining - rideBoardingSeconds : remaining
      const span = leg.mode === 'ride' ? seconds - rideBoardingSeconds : seconds
      return { ...along(leg.path, moving <= 0 ? 0 : moving / span), mode: leg.mode }
    }
    remaining -= seconds
  }
  const last = trip.legs.at(-1)
  return { ...(last ? last.path.at(-1)! : { x: 0, y: 0 }), mode: 'walk', heading: 0 }
}
