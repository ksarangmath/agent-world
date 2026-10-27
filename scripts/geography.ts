import { groundKinds, mapHeight, mapWidth, warp, type GroundKind } from '../shared/map/grid.ts'

type Point = [number, number]
type Box = [west: number, south: number, east: number, north: number]
type Geometry =
  | { type: 'Polygon'; coordinates: Point[][] }
  | { type: 'MultiPolygon'; coordinates: Point[][][] }
  | { type: 'LineString'; coordinates: Point[] }
  | { type: 'MultiLineString'; coordinates: Point[][] }
type Feature = { properties: Record<string, string | null>; geometry: Geometry | null }

const bayArea: Box = [-122.62, 37.2, -121.8, 38.0]
const sanFrancisco: Box = [-122.53, 37.7, -122.35, 37.84]

const mainStreets = [
  'Bridgeway',
  'Panoramic Hwy',
  'Tiburon Blvd',
  'Miller Ave',
  'Muir Woods Rd',
  'Conzelman Rd',
  'Bunker Rd',
  'Alexander Ave',
  'Paradise Dr',
  'E Blithedale Ave',
  'Broadway',
  'Telegraph Ave',
  'San Pablo Ave',
  'Grand Ave',
  'MacArthur Blvd',
  'International Blvd',
  'Shattuck Ave',
  'College Ave',
  'University Ave',
  'Ashby Ave',
  'Martin Luther King Jr Way',
  'Piedmont Ave',
  'Lakeshore Ave',
  'Foothill Blvd',
  'Fruitvale Ave',
  'Park Blvd',
  'Claremont Ave',
  'Solano Ave',
  'Hearst Ave',
  'Bancroft Way',
  'Dwight Way',
  'Sacramento St',
  'Gilman St',
  'Webster St',
  'Harrison St',
  '14th St',
  'W Grand Ave',
  'Powell St',
  'Park St',
  'Central Ave',
  'Lincoln Ave',
  'Grizzly Peak Blvd',
  'Page Mill Rd',
  'Sand Hill Rd',
  'Castro St',
  'Shoreline Blvd',
  'Middlefield Rd',
  'Alma St',
  'California Ave',
  'Embarcadero Rd',
  'Charleston Rd',
  'Rengstorff Ave',
  'Santa Clara St',
  'San Fernando St',
  'N 1st St',
  'S 1st St',
  'The Alameda',
  'Stevens Creek Blvd',
  'Mathilda Ave',
  'Moffett Blvd',
  'Burlingame Ave',
  'Millbrae Ave',
  'Hillsdale Blvd',
  'Woodside Rd',
  'Ralston Ave',
]

const parks: Box[] = [
  [-122.5106, 37.7655, -122.4545, 37.7733],
  [-122.4545, 37.7712, -122.4433, 37.7727],
  [-122.505, 37.781, -122.4925, 37.7865],
  [-122.428, 37.712, -122.406, 37.723],
  [-122.4515, 37.7505, -122.444, 37.758],
  [-122.457, 37.736, -122.451, 37.7405],
  [-122.444, 37.736, -122.4385, 37.746],
  [-122.49, 37.733, -122.474, 37.737],
  [-122.504, 37.712, -122.485, 37.734],
  [-122.4625, 37.756, -122.4535, 37.761],
  [-122.443, 37.766, -122.4385, 37.77],
  [-122.4285, 37.7585, -122.4255, 37.7615],
  [-122.4355, 37.7755, -122.4325, 37.777],
  [-122.4175, 37.742, -122.412, 37.745],
  [-122.444, 37.8055, -122.433, 37.8075],
  [-122.387, 37.705, -122.375, 37.711],
  [-122.481, 37.787, -122.447, 37.812],
  [-122.515, 37.776, -122.49, 37.791],
  [-122.505, 37.705, -122.495, 37.722],
]

const campuses = [
  'Stanford Univ',
  'Univ of California',
  'Univ of California San Francisco',
  'San Francisco State Univ',
  'Univ of San Francisco',
  'San Jose State Univ',
  'Santa Clara Univ',
]

const namedStreets = [
  'Powell St',
  'Hyde St',
  'California St',
  'Market St',
  'The Embarcadero',
  'Dolores St',
  'Lombard St',
  'Grant Ave',
  'Castro St',
]

const tiger = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb'

async function layer(path: string, box: Box, where = '1=1'): Promise<Feature[]> {
  const query = new URLSearchParams({
    where,
    geometry: box.join(','),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outSR: '4326',
    outFields: '*',
    returnGeometry: 'true',
    geometryPrecision: '5',
    f: 'geojson',
  })
  const response = await fetch(`${tiger}/${path}/query?${query}`, {
    signal: AbortSignal.timeout(300_000),
  })
  const page = (await response.json()) as {
    features?: Feature[]
    exceededTransferLimit?: boolean
    error?: unknown
  }
  if (!response.ok || !page.features || page.exceededTransferLimit) {
    throw new Error(`${path}: ${response.status} ${JSON.stringify(page.error ?? 'truncated')}`)
  }
  return page.features
}

const polygons = (geometry: Geometry | null): Point[][][] =>
  geometry?.type === 'Polygon'
    ? [geometry.coordinates]
    : geometry?.type === 'MultiPolygon'
      ? geometry.coordinates
      : []

const lines = (geometry: Geometry | null): Point[][] =>
  geometry?.type === 'LineString'
    ? [geometry.coordinates]
    : geometry?.type === 'MultiLineString'
      ? geometry.coordinates
      : []

const warpAll = (points: Point[]): Point[] => points.map(([lon, lat]) => warp(lon, lat))

function fill(grid: Uint8Array, rings: Point[][], kind: GroundKind, onlyOver?: GroundKind) {
  const value = groundKinds.indexOf(kind)
  const over = onlyOver && groundKinds.indexOf(onlyOver)
  const crossings: number[][] = Array.from({ length: mapHeight }, () => [])
  for (const ring of rings) {
    ring.forEach(([x0, y0], i) => {
      const [x1, y1] = ring[(i + 1) % ring.length]!
      if (y0 === y1) return
      const top = Math.max(0, Math.ceil(Math.min(y0, y1) - 0.5))
      const bottom = Math.min(mapHeight - 1, Math.ceil(Math.max(y0, y1) - 0.5) - 1)
      for (let y = top; y <= bottom; y++) {
        crossings[y]!.push(x0 + ((y + 0.5 - y0) / (y1 - y0)) * (x1 - x0))
      }
    })
  }
  crossings.forEach((row, y) => {
    row.sort((a, b) => a - b)
    for (let i = 0; i + 1 < row.length; i += 2) {
      const start = Math.max(0, Math.ceil(row[i]! - 0.5))
      const end = Math.min(mapWidth, Math.ceil(row[i + 1]! - 0.5))
      for (let x = start; x < end; x++) {
        if (over === undefined || grid[y * mapWidth + x] === over) grid[y * mapWidth + x] = value
      }
    }
  })
}

function beaches(grid: Uint8Array) {
  const ocean = groundKinds.indexOf('ocean')
  const sand = groundKinds.indexOf('sand')
  const shore = new Set<number>()
  for (let y = 0; y < mapHeight; y++) {
    for (let x = 0; x < mapWidth; x++) {
      const kind = groundKinds[grid[y * mapWidth + x]!]
      if (kind !== 'land' && kind !== 'park') continue
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (grid[(y + dy) * mapWidth + x + dx] === ocean) shore.add(y * mapWidth + x)
        }
      }
    }
  }
  for (const tile of shore) grid[tile] = sand
}

function runLengths(grid: Uint8Array): number[][] {
  return Array.from({ length: mapHeight }, (_, y) => {
    const row: number[] = []
    for (let x = 0; x < mapWidth;) {
      const kind = grid[y * mapWidth + x]!
      let end = x
      while (end < mapWidth && grid[y * mapWidth + end] === kind) end++
      row.push(kind, end - x)
      x = end
    }
    return row
  })
}

function simplify(points: Point[], tolerance: number): Point[] {
  if (points.length < 3) return points
  const [ax, ay] = points[0]!
  const [bx, by] = points[points.length - 1]!
  const length = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2)
  let farthest = 0
  let index = 0
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i]!
    const distance =
      length === 0
        ? Math.sqrt((px - ax) ** 2 + (py - ay) ** 2)
        : Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / length
    if (distance > farthest) [farthest, index] = [distance, i]
  }
  if (farthest <= tolerance) return [points[0]!, points[points.length - 1]!]
  return [
    ...simplify(points.slice(0, index + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(index), tolerance),
  ]
}

function polyline(points: Point[]): number[] {
  const flat: number[] = []
  for (const [x, y] of simplify(warpAll(points), 0.45)) {
    const [rx, ry] = [Math.round(x), Math.round(y)]
    if (flat.at(-2) === rx && flat.at(-1) === ry) continue
    flat.push(rx, ry)
  }
  const inside = flat.some((value, i) => value >= 0 && value < (i % 2 === 0 ? mapWidth : mapHeight))
  return flat.length >= 4 && inside ? flat : []
}

const within =
  ([west, south, east, north]: Box) =>
  ([lon, lat]: Point) =>
    lon >= west && lon <= east && lat >= south && lat <= north

function clip(points: Point[], keep: (point: Point) => boolean): Point[][] {
  const pieces: Point[][] = [[]]
  for (const point of points) {
    if (keep(point)) pieces.at(-1)!.push(point)
    else if (pieces.at(-1)!.length) pieces.push([])
  }
  return pieces.filter((piece) => piece.length >= 2)
}

const polylines = (features: Feature[], keep = within(bayArea)) =>
  features
    .flatMap((feature) => lines(feature.geometry).flatMap((line) => clip(line, keep)))
    .map(polyline)
    .filter((line) => line.length)

const [counties, water, nps, colleges, freeways, streets, rail, local, main] = await Promise.all([
  layer('State_County/MapServer/1', bayArea, "STATE='06'"),
  layer('Hydro/MapServer/1', bayArea),
  layer('Special_Land_Use_Areas/MapServer/0', bayArea),
  layer('Special_Land_Use_Areas/MapServer/2', bayArea),
  layer('Transportation/MapServer/2', bayArea),
  layer('Transportation/MapServer/6', bayArea),
  layer('Transportation/MapServer/9', bayArea, "NAME IN ('Bart','Caltrain')"),
  layer('Transportation/MapServer/8', sanFrancisco, "MTFCC='S1400'"),
  layer(
    'Transportation/MapServer/8',
    bayArea,
    `MTFCC='S1400' AND NAME IN (${mainStreets.map((name) => `'${name}'`).join(',')})`,
  ),
])

const grid = new Uint8Array(mapWidth * mapHeight)
for (const county of counties) {
  for (const polygon of polygons(county.geometry)) fill(grid, polygon.map(warpAll), 'land')
}
for (const area of water) {
  const kind = area.properties.MTFCC === 'H2053' ? 'ocean' : 'water'
  for (const polygon of polygons(area.geometry)) fill(grid, polygon.map(warpAll), kind)
}
for (const area of nps) {
  for (const polygon of polygons(area.geometry)) fill(grid, polygon.map(warpAll), 'park', 'land')
}
for (const [west, south, east, north] of parks) {
  const corners: Point[] = [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
  ]
  fill(grid, [warpAll(corners)], 'park', 'land')
}
for (const college of colleges) {
  if (!campuses.includes(college.properties.NAME ?? '')) continue
  for (const polygon of polygons(college.geometry)) {
    fill(grid, polygon.map(warpAll), 'campus', 'land')
  }
}
for (const area of water) {
  const kind = area.properties.MTFCC === 'H2053' ? 'ocean' : 'water'
  if (area.properties.MTFCC !== 'H2030' && area.properties.MTFCC !== 'H2040') continue
  for (const polygon of polygons(area.geometry)) fill(grid, polygon.map(warpAll), kind)
}
beaches(grid)

console.log(
  JSON.stringify({
    ground: runLengths(grid),
    roads: {
      freeway: polylines(freeways),
      street: [
        ...polylines(streets),
        ...polylines(main, (point) => within(bayArea)(point) && !within(sanFrancisco)(point)),
      ],
      local: polylines(local, within(sanFrancisco)),
    },
    named: Object.fromEntries(
      namedStreets.map((name) => [
        name,
        polylines(
          local.filter((feature) => feature.properties.NAME === name),
          within(sanFrancisco),
        ),
      ]),
    ),
    rails: {
      bart: polylines(rail.filter((feature) => feature.properties.NAME === 'Bart')),
      caltrain: polylines(rail.filter((feature) => feature.properties.NAME === 'Caltrain')),
    },
  }),
)
