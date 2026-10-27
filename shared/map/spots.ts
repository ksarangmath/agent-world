import { mapHeight, mapWidth } from './grid'
import { places, type Place } from './places'
import { roads, type Tile } from './route'
import { groundAt, isDry } from './terrain'

const index = (tile: Tile) => tile.y * mapWidth + tile.x
const taken = new Set<number>()

function free(tile: Tile): boolean {
  if (tile.x < 1 || tile.y < 1 || tile.x >= mapWidth - 1 || tile.y >= mapHeight - 1) return false
  return isDry(groundAt(tile.x, tile.y)) && !roads[index(tile)] && !taken.has(index(tile))
}

function claimSpots(center: Tile, capacity: number): Tile[] {
  const chosen = new Set<number>()
  const open = (tile: Tile) => free(tile) && !chosen.has(index(tile))
  const closer = (a: Tile, b: Tile) =>
    (a.x - center.x) ** 2 + (a.y - center.y) ** 2 - (b.x - center.x) ** 2 - (b.y - center.y) ** 2 ||
    index(a) - index(b)
  const nearestOpen = () => {
    for (let radius = 0; radius <= 64; radius++) {
      const ring: Tile[] = []
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) === radius) {
            ring.push({ x: center.x + dx, y: center.y + dy })
          }
        }
      }
      const found = ring.filter(open).sort(closer)[0]
      if (found) return found
    }
    throw new Error(`no free ground near ${center.x},${center.y}`)
  }
  const spots: Tile[] = []
  const frontier = new Map<number, Tile>()
  while (spots.length < capacity) {
    const next = [...frontier.values()].filter(open).sort(closer)[0] ?? nearestOpen()
    frontier.delete(index(next))
    chosen.add(index(next))
    spots.push(next)
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const neighbor = { x: next.x + dx, y: next.y + dy }
      if (open(neighbor)) frontier.set(index(neighbor), neighbor)
    }
  }
  for (const spot of spots) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) taken.add(index({ x: spot.x + dx, y: spot.y + dy }))
    }
  }
  return spots
}

const claimed: ReadonlyMap<string, Tile[]> = new Map(
  places.map((place) => [place.id, claimSpots(place.center, place.capacity)]),
)

export const spots = (place: Place): Tile[] => claimed.get(place.id)!
