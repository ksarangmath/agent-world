import { describe, expect, test } from 'vitest'
import { places } from './places'
import { spots } from './spots'
import { mapHeight, mapWidth } from './grid'
import {
  ferryTerminal,
  legSeconds as legSecondsOf,
  positionOnRoute,
  rides,
  roadAt,
  route,
  type Tile,
} from './route'
import { groundAt, isDry } from './terrain'

const key = (tile: Tile) => `${tile.x},${tile.y}`

describe('places', () => {
  test('there are 30, with unique ids, and most are in San Francisco', () => {
    expect(places).toHaveLength(30)
    expect(new Set(places.map((place) => place.id)).size).toBe(places.length)
    const sf = places.filter((place) => place.region === 'sf').length
    expect(sf / places.length).toBeGreaterThan(0.65)
  })

  test('capacity is 12 to 24, with one spot per seat', () => {
    for (const place of places) {
      expect(place.capacity, place.id).toBeGreaterThanOrEqual(12)
      expect(place.capacity, place.id).toBeLessThanOrEqual(24)
      expect(spots(place), place.id).toHaveLength(place.capacity)
    }
  })

  test('every spot is on dry ground, off the roads, and used by one place', () => {
    const taken = new Map<string, string>()
    for (const place of places) {
      for (const spot of spots(place)) {
        expect(spot.x >= 0 && spot.y >= 0 && spot.x < mapWidth && spot.y < mapHeight).toBe(true)
        expect(isDry(groundAt(spot.x, spot.y)), `${place.id} ${key(spot)}`).toBe(true)
        expect(roadAt(spot.x, spot.y), `${place.id} ${key(spot)}`).toBeUndefined()
        expect(taken.get(key(spot)), `${place.id} overlaps`).toBeUndefined()
        taken.set(key(spot), place.id)
      }
    }
  })
})

describe('route', () => {
  test('rides start and end on roads', () => {
    for (const ride of rides) {
      expect(roadAt(ride.from.x, ride.from.y), ride.name).toBeDefined()
      expect(roadAt(ride.to.x, ride.to.y), ride.name).toBeDefined()
    }
  })

  test('every place is reachable from the ferry terminal, near a road, deterministically', () => {
    for (const place of places) {
      const to = spots(place)[0]!
      const trip = route(ferryTerminal, to)
      expect(trip.seconds, place.id).toBeGreaterThan(0)
      expect(trip.legs[0]!.path[0]).toEqual(ferryTerminal)
      expect(trip.legs.at(-1)!.path.at(-1)).toEqual(to)
      const [last, beforeLast] = [trip.legs.at(-1)!.path.at(-1)!, trip.legs.at(-1)!.path.at(-2)!]
      expect(Math.hypot(last.x - beforeLast.x, last.y - beforeLast.y), place.id).toBeLessThan(30)
    }
    const [from, to] = [spots(places[0]!)[0]!, spots(places.at(-1)!)[0]!]
    expect(route(from, to)).toEqual(route(from, to))
  }, 30_000)

  test('a trip to the same tile is empty', () => {
    expect(route({ x: 300, y: 400 }, { x: 300, y: 400 })).toEqual({ legs: [], seconds: 0 })
  })

  test('a trip that once differed between JavaScript engines stays pinned', () => {
    const from = spots(places.find((place) => place.id === 'mountain-summit-trail')!)[0]!
    const to = spots(places.find((place) => place.id === 'dogpatch-robotics')!)[0]!
    expect(route(from, to).seconds).toMatchInlineSnapshot(`306.4213562373097`)
  })

  test('crossing the bay rides instead of walking, and trips take minutes', () => {
    const sf = spots(places.find((place) => place.id === 'dogpatch-robotics')!)[0]!
    const oakland = spots(places.find((place) => place.id === 'oakland-music-hall')!)[0]!
    const trip = route(sf, oakland)
    expect(trip.legs.some((leg) => leg.mode === 'ride')).toBe(true)
    expect(trip.seconds).toBeGreaterThan(30)
    expect(trip.seconds).toBeLessThan(600)
  })

  test('a traveler starts at the origin, ends at the destination, and waits to board rides', () => {
    const from = spots(places.find((place) => place.id === 'dogpatch-robotics')!)[0]!
    const to = spots(places.find((place) => place.id === 'oakland-music-hall')!)[0]!
    const trip = route(from, to)
    expect(positionOnRoute(trip, 0)).toMatchObject(from)
    expect(positionOnRoute(trip, trip.seconds + 1)).toMatchObject(to)
    const walkFirst = trip.legs[0]!
    const boarding = positionOnRoute(trip, legSecondsOf(walkFirst) + 5)
    expect(boarding).toMatchObject({ ...trip.legs[1]!.path[0]!, mode: 'ride' })
  })
})
