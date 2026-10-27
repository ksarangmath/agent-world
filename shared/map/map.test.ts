import { describe, expect, test } from 'vitest'
import { places, spots } from './places'
import {
  legSeconds as legSecondsOf,
  mapHeight,
  mapWidth,
  positionOnRoute,
  rides,
  roadTiles,
  route,
  type Tile,
} from './route'
import { tileKind } from './terrain'

const key = (tile: Tile) => `${tile.x},${tile.y}`

describe('places', () => {
  test('there are at least 60, with unique ids, and most are in San Francisco', () => {
    expect(places.length).toBeGreaterThanOrEqual(60)
    expect(new Set(places.map((place) => place.id)).size).toBe(places.length)
    const sf = places.filter((place) => place.region === 'sf').length
    expect(sf / places.length).toBeGreaterThan(0.65)
  })

  test('capacity is 6 to 12 and fits the rectangle', () => {
    for (const place of places) {
      expect(place.capacity, place.id).toBeGreaterThanOrEqual(6)
      expect(place.capacity, place.id).toBeLessThanOrEqual(12)
      expect(place.capacity, place.id).toBeLessThanOrEqual(place.width * place.height)
    }
  })

  test('every spot is on dry ground, off the roads, and used by one place', () => {
    const taken = new Map<string, string>()
    for (const place of places) {
      for (const spot of spots(place)) {
        expect(spot.x >= 0 && spot.y >= 0 && spot.x < mapWidth && spot.y < mapHeight).toBe(true)
        expect(['land', 'park', 'sand'], `${place.id} ${key(spot)}`).toContain(
          tileKind(spot.x, spot.y),
        )
        expect(taken.get(key(spot)), `${place.id} overlaps`).toBeUndefined()
        taken.set(key(spot), place.id)
      }
    }
  })
})

describe('route', () => {
  test('rides start and end on roads', () => {
    for (const ride of rides) {
      expect(roadTiles.has(ride.from[1] * mapWidth + ride.from[0]), ride.name).toBe(true)
      expect(roadTiles.has(ride.to[1] * mapWidth + ride.to[0]), ride.name).toBe(true)
    }
  })

  test('every place is reachable from every region, deterministically', () => {
    const origins = ['marina-harbor', 'waterfront-cafe', 'oakland-music-hall', 'big-tech-campus']
    for (const origin of origins) {
      const from = spots(places.find((place) => place.id === origin)!)[0]!
      for (const place of places.filter((p) => p.id !== origin)) {
        const to = spots(place)[0]!
        const trip = route(from, to)
        expect(trip.seconds, `${origin} -> ${place.id}`).toBeGreaterThan(0)
        expect(trip.legs[0]!.path[0]).toEqual(from)
        expect(trip.legs.at(-1)!.path.at(-1)).toEqual(to)
        expect(route(from, to)).toEqual(trip)
      }
    }
  })

  test('a trip to the same tile is empty', () => {
    expect(route({ x: 64, y: 71 }, { x: 64, y: 71 })).toEqual({ legs: [], seconds: 0 })
  })

  test('a trip that once differed between JavaScript engines stays pinned', () => {
    const from = spots(places.find((place) => place.id === 'headlands-trailhead')!)[0]!
    const to = spots(places.find((place) => place.id === 'drone-test-yard')!)[0]!
    expect(route(from, to).seconds).toMatchInlineSnapshot(`202.9144239903544`)
  })

  test('crossing the bay rides instead of walking, and trips take minutes', () => {
    const sf = spots(places.find((place) => place.id === 'dogpatch-robotics')!)[0]!
    const oakland = spots(places.find((place) => place.id === 'oakland-art-gallery')!)[0]!
    const trip = route(sf, oakland)
    expect(trip.legs.some((leg) => leg.mode === 'ride')).toBe(true)
    expect(trip.seconds).toBeGreaterThan(30)
    expect(trip.seconds).toBeLessThan(600)
  })

  test('a traveler starts at the origin, ends at the destination, and waits to board rides', () => {
    const from = spots(places.find((place) => place.id === 'dogpatch-robotics')!)[0]!
    const to = spots(places.find((place) => place.id === 'oakland-art-gallery')!)[0]!
    const trip = route(from, to)
    expect(positionOnRoute(trip, 0)).toMatchObject(from)
    expect(positionOnRoute(trip, trip.seconds + 1)).toMatchObject(to)
    const walkFirst = trip.legs[0]!
    const boarding = positionOnRoute(trip, legSecondsOf(walkFirst) + 5)
    expect(boarding).toMatchObject({ ...trip.legs[1]!.path[0]!, mode: 'ride' })
  })
})
