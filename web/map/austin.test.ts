import { beforeAll, describe, expect, test, vi } from 'vitest'
import { mapHeight, mapWidth } from '../../shared/map/grid'
import { legSeconds, rideBoardingSeconds } from '../../shared/map/route'

vi.stubGlobal('location', { pathname: '/austin' })

type Loaded = {
  atlas: typeof import('./atlas')
  city: typeof import('./city')
  decks: typeof import('./decks')
  landmarks: typeof import('./landmarks')
  neighborhoods: typeof import('./neighborhoods')
  places: typeof import('./places')
  rides: typeof import('./rides')
  scatter: typeof import('./decor/scatter')
  skyloop: typeof import('./skyloop')
}

let map: Loaded

beforeAll(async () => {
  map = {
    atlas: await import('./atlas'),
    city: await import('./city'),
    decks: await import('./decks'),
    landmarks: await import('./landmarks'),
    neighborhoods: await import('./neighborhoods'),
    places: await import('./places'),
    rides: await import('./rides'),
    scatter: await import('./decor/scatter'),
    skyloop: await import('./skyloop'),
  }
}, 60_000)

describe('the Austin map view', () => {
  test('is the map the page at /austin shows', async () => {
    const { metro } = await import('../metro')
    expect(metro).toBe('austin')
    expect(map.atlas.places.every((place) => place.metro === 'austin')).toBe(true)
  })

  test('builds a city with a downtown taller than its suburbs', () => {
    const { buildings, trees } = map.city.buildCity()
    expect(buildings.length).toBeGreaterThan(2000)
    expect(trees.length).toBeGreaterThan(2000)
    const [x, y] = map.atlas.warp(-97.7431, 30.2672)
    const near = (b: { x: number; y: number }, reach: number) =>
      Math.hypot(b.x - x, b.y - y) < reach
    const tallest = (list: typeof buildings) => Math.max(...list.map((b) => b.height))
    expect(tallest(buildings.filter((b) => near(b, 12)))).toBeGreaterThan(8)
    expect(tallest(buildings.filter((b) => !near(b, 60)))).toBeLessThan(8)
  })

  test('keeps its towers in the tower districts, and none across the lake from downtown', () => {
    const towers = map.neighborhoods.neighborhoods.filter((one) => one.style === 'towers')
    const tall = map.city
      .buildCity()
      .buildings.filter((building) => building.height >= 6 && building.base <= 1)
    expect(tall.length).toBeGreaterThan(30)
    for (const building of tall) {
      const among = towers.some((one) => Math.hypot(one.x - building.x, one.y - building.y) < 16)
      expect(among, `a tall building at ${building.x},${building.y}`).toBe(true)
    }
    const [downtown] = map.atlas.warp(-97.7431, 30.2672)
    const acrossTheLake = tall.filter(
      (building) =>
        Math.abs(building.x - downtown) < 16 &&
        Array.from({ length: 14 }, (_, north) => north + 1).some(
          (north) =>
            map.atlas.groundAt(Math.floor(building.x), Math.floor(building.y) - north) === 'water',
        ),
    )
    expect(acrossTheLake).toEqual([])
  })

  test('leaves the Capitol in plain view across its grounds from the lawn', () => {
    const [x, y] = map.atlas.warp(-97.7404, 30.2749)
    const lawn = map.atlas.places.find((place) => place.id === 'capitol-lawn')!
    const inTheWay = map.city
      .buildCity()
      .buildings.filter(
        (building) =>
          building.x + building.width > x - 3 &&
          building.x < x + 3 &&
          building.y + building.depth > y - 1.5 &&
          building.y < lawn.center.y,
      )
    expect(inTheWay).toEqual([])
    expect(map.atlas.groundAt(Math.floor(x), Math.floor(y) + 2)).toBe('park')
  })

  test('stands no landmark and no stretch of Skyloop on a spot where people stand', () => {
    const spotTiles = new Set(
      map.atlas.places.flatMap((place) =>
        map.atlas.spots(place).map((spot) => spot.y * mapWidth + spot.x),
      ),
    )
    const covered = [...map.landmarks.reservedTiles].filter((tile) => spotTiles.has(tile))
    expect(covered).toEqual([])
  })

  test('keeps buildings and decorations off the landmarks and the Skyloop', () => {
    const city = map.city.buildCity()
    const { reservedTiles } = map.landmarks
    expect(reservedTiles.size).toBeGreaterThan(200)
    for (const building of city.buildings) {
      if (building.width < 1 || building.depth < 1 || building.base > 1) continue
      const tile = Math.floor(building.y) * mapWidth + Math.floor(building.x)
      expect(reservedTiles.has(tile), `${building.x},${building.y}`).toBe(false)
    }
    const scattered = map.scatter.scatter(city)
    expect(scattered.lit.length).toBeGreaterThan(500)
    expect(scattered.kites.length).toBeGreaterThan(0)
    expect(scattered.seaLions).toEqual([])
    expect(scattered.whales).toEqual([])
  })

  test('raises the Skyloop over land with a station for each end of every ride', () => {
    const { skyloop } = map.skyloop
    expect(skyloop.stations).toHaveLength(7)
    expect(map.atlas.rides).toHaveLength(3)
    for (let i = 0; i < skyloop.count; i++) {
      expect(skyloop.x[i]).toBeGreaterThan(0)
      expect(skyloop.x[i]).toBeLessThan(mapWidth)
      expect(skyloop.z[i]).toBeGreaterThan(0)
      expect(skyloop.z[i]).toBeLessThan(mapHeight)
    }
    const stationNear = (tile: { x: number; y: number }) =>
      skyloop.stations.reduce((best, i) =>
        Math.hypot(skyloop.x[i]! - tile.x, skyloop.z[i]! - tile.y) <
        Math.hypot(skyloop.x[best]! - tile.x, skyloop.z[best]! - tile.y)
          ? i
          : best,
      )
    for (const ride of map.atlas.rides) {
      expect(stationNear(ride.from), ride.name).not.toBe(stationNear(ride.to))
      const reach = Math.hypot(
        skyloop.x[stationNear(ride.from)]! - ride.from.x,
        skyloop.z[stationNear(ride.from)]! - ride.from.y,
      )
      expect(reach, ride.name).toBeLessThan(12)
    }
  })

  test('carries a rider the whole way on every ride', () => {
    const seat = { x: 0, y: 0, height: 0, heading: 0, walking: false }
    for (const ride of map.atlas.rides) {
      const leg = { mode: 'ride' as const, path: [ride.from, ride.to] }
      const trip = { legs: [leg], seconds: legSeconds(leg) }
      for (const seconds of [0, rideBoardingSeconds + 1, trip.seconds - 0.1]) {
        map.rides.carriers.count = 0
        expect(map.rides.rideAt(trip, 0, seconds, seat), ride.name).toBe(true)
        expect(Number.isFinite(seat.x + seat.y + seat.height + seat.heading), ride.name).toBe(true)
      }
      expect(Math.hypot(seat.x - ride.to.x, seat.y - ride.to.y), ride.name).toBeLessThan(12)
    }
  })

  test("puts nothing tall and bulky on anybody's spot", () => {
    for (const place of map.atlas.places) {
      const centers = map.atlas.spots(place).map((spot) => ({ x: spot.x + 0.5, z: spot.y + 0.5 }))
      for (const prop of map.places.propsOf(place)) {
        const [width, height, depth] = prop.size
        if (height < 0.5 || Math.min(width, depth) < 0.3) continue
        const [cos, sin] = [Math.cos(prop.yaw), Math.sin(prop.yaw)]
        const covered = centers.filter((center) => {
          const [dx, dz] = [center.x - prop.x, center.z - prop.z]
          const [across, along] = [dx * cos - dz * sin, dx * sin + dz * cos]
          return Math.abs(across) < width / 2 + 0.15 && Math.abs(along) < depth / 2 + 0.15
        })
        expect(covered, `${place.id}: a ${width.toFixed(2)} by ${depth.toFixed(2)} prop`).toEqual(
          [],
        )
      }
    }
  })

  test('keeps the bats and the inner tubes over the lake the whole way down it', async () => {
    const { downstream } = await import('./course')
    for (const [lon, lat] of [
      [-97.7452, 30.2612],
      [-97.7865, 30.2899],
    ] as const) {
      const course = downstream(map.atlas.warp(lon, lat), 30)
      expect(course.length).toBeGreaterThan(8)
      for (const [x, z] of course) {
        expect(map.atlas.groundAt(Math.floor(x), Math.floor(z)), `${x},${z}`).toBe('water')
      }
    }
  })

  test('queues lawn chairs at the barbecue school and sinks a scooter in the lake', () => {
    const { lit } = map.scatter.scatter(map.city.buildCity())
    const of = (kit: string) => lit.filter((prop) => prop.kit === kit)
    const spotTiles = new Set(
      map.atlas.places.flatMap((place) =>
        map.atlas.spots(place).map((spot) => spot.y * mapWidth + spot.x),
      ),
    )
    expect(of('campChair')).toHaveLength(7)
    expect(of('cooler')).toHaveLength(1)
    expect(of('longhorn')).toHaveLength(5)
    for (const prop of [...of('campChair'), ...of('cooler'), ...of('longhorn')]) {
      const tile = Math.floor(prop.y) * mapWidth + Math.floor(prop.x)
      expect(spotTiles.has(tile), `${prop.kit} at ${prop.x},${prop.y}`).toBe(false)
      expect(map.atlas.groundAt(Math.floor(prop.x), Math.floor(prop.y))).not.toBe('water')
    }
    const sunk = of('scooter').filter(
      (prop) => map.atlas.groundAt(Math.floor(prop.x), Math.floor(prop.y)) === 'water',
    )
    expect(sunk).toHaveLength(1)
  })

  test('crosses the lake on bridge decks that people and cars can stand on', () => {
    const { decks, surfaceAt } = map.decks
    expect(decks.length).toBeGreaterThan(10)
    for (const deck of decks) {
      expect(surfaceAt(deck.x, deck.y), `${deck.x},${deck.y}`).toBeGreaterThan(0)
    }
  })
})
