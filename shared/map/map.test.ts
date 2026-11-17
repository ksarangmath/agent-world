import { describe, expect, test } from 'vitest'
import { metros } from '../metros'
import { atlasOf } from './atlas'
import { mapHeight, mapWidth } from './grid'
import { places, placesIn } from './places'
import { legSeconds as legSecondsOf, positionOnRoute, type Tile } from './route'
import { isDry } from './terrain'

const key = (tile: Tile) => `${tile.x},${tile.y}`

describe('places', () => {
  test('ids are unique across every map', () => {
    expect(new Set(places.map((place) => place.id)).size).toBe(places.length)
  })

  test('the bay has at least 50, and Fog City has more than any other region', () => {
    const bay = placesIn('bay')
    expect(bay.length).toBeGreaterThanOrEqual(50)
    const count = (region: string) => bay.filter((place) => place.region === region).length
    for (const region of ['marin', 'east_bay', 'south_bay']) {
      expect(count('sf'), region).toBeGreaterThan(count(region))
    }
  })

  test('Austin has at least 40, and Bat City has more than any other region', () => {
    const austin = placesIn('austin')
    expect(austin.length).toBeGreaterThanOrEqual(40)
    const count = (region: string) => austin.filter((place) => place.region === region).length
    for (const region of ['hill_country', 'silicon_hills', 'brisket_belt']) {
      expect(count('austin'), region).toBeGreaterThan(count(region))
    }
  })
})

describe.each(metros)('the %s map', (metro) => {
  const { spots, groundAt, roadAt, rides, arrival, route } = atlasOf(metro)
  const here = placesIn(metro)

  test('capacity is 12 to 24, with one spot per seat', () => {
    for (const place of here) {
      expect(place.capacity, place.id).toBeGreaterThanOrEqual(12)
      expect(place.capacity, place.id).toBeLessThanOrEqual(24)
      expect(spots(place), place.id).toHaveLength(place.capacity)
    }
  })

  test('every spot is on dry ground, off the roads, near its place, and used by one place', () => {
    const taken = new Map<string, string>()
    for (const place of here) {
      for (const spot of spots(place)) {
        expect(spot.x >= 0 && spot.y >= 0 && spot.x < mapWidth && spot.y < mapHeight).toBe(true)
        expect(isDry(groundAt(spot.x, spot.y)), `${place.id} ${key(spot)}`).toBe(true)
        expect(roadAt(spot.x, spot.y), `${place.id} ${key(spot)}`).toBeUndefined()
        expect(taken.get(key(spot)), `${place.id} overlaps`).toBeUndefined()
        taken.set(key(spot), place.id)
      }
    }
  })

  test('rides start and end on roads, at different tiles', () => {
    for (const ride of rides) {
      expect(roadAt(ride.from.x, ride.from.y), ride.name).toBeDefined()
      expect(roadAt(ride.to.x, ride.to.y), ride.name).toBeDefined()
      expect(key(ride.from), ride.name).not.toBe(key(ride.to))
    }
  })

  test('every place is reachable from where people arrive, near a road, deterministically', () => {
    for (const place of here) {
      const to = spots(place)[0]!
      const trip = route(arrival, to)
      expect(trip.seconds, place.id).toBeGreaterThan(0)
      expect(trip.seconds, place.id).toBeLessThan(600)
      expect(trip.legs[0]!.path[0]).toEqual(arrival)
      expect(trip.legs.at(-1)!.path.at(-1)).toEqual(to)
      const [last, beforeLast] = [trip.legs.at(-1)!.path.at(-1)!, trip.legs.at(-1)!.path.at(-2)!]
      expect(Math.hypot(last.x - beforeLast.x, last.y - beforeLast.y), place.id).toBeLessThan(30)
    }
    const [from, to] = [spots(here[0]!)[0]!, spots(here.at(-1)!)[0]!]
    expect(route(from, to)).toEqual(route(from, to))
  }, 30_000)

  test('a trip to the same tile is empty', () => {
    expect(route({ x: 300, y: 400 }, { x: 300, y: 400 })).toEqual({ legs: [], seconds: 0 })
  })
})

describe('routes across the bay', () => {
  const { spots, route } = atlasOf('bay')
  const spot = (id: string) => spots(places.find((place) => place.id === id)!)[0]!

  test('a trip that once differed between JavaScript engines stays pinned', () => {
    const trip = route(spot('mountain-summit-trail'), spot('dogpatch-robotics'))
    expect(trip.seconds).toMatchInlineSnapshot(`180.90241456844137`)
  })

  test('crossing the bay rides instead of walking, and trips take minutes', () => {
    const trip = route(spot('dogpatch-robotics'), spot('oakland-music-hall'))
    expect(trip.legs.some((leg) => leg.mode === 'ride')).toBe(true)
    expect(trip.seconds).toBeGreaterThan(30)
    expect(trip.seconds).toBeLessThan(600)
  })

  test('a traveler starts at the origin, ends at the destination, and waits to board rides', () => {
    const [from, to] = [spot('dogpatch-robotics'), spot('oakland-music-hall')]
    const trip = route(from, to)
    expect(positionOnRoute(trip, 0)).toMatchObject(from)
    expect(positionOnRoute(trip, trip.seconds + 1)).toMatchObject(to)
    const walkFirst = trip.legs[0]!
    const boarding = positionOnRoute(trip, legSecondsOf(walkFirst) + 5)
    expect(boarding).toMatchObject({ ...trip.legs[1]!.path[0]!, mode: 'ride' })
  })
})

describe('routes across Austin', () => {
  const { spots, route } = atlasOf('austin')
  const spot = (id: string) => spots(places.find((place) => place.id === id)!)[0]!

  test('going from downtown to the far north rides instead of walking', () => {
    const trip = route(spot('sixth-street-stage'), spot('round-rock-donuts'))
    expect(trip.legs.some((leg) => leg.mode === 'ride')).toBe(true)
    expect(trip.seconds).toBeGreaterThan(30)
  })
})
