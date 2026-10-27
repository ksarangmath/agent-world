import { groundKinds, mapHeight, mapWidth, warp, type GroundKind } from '../shared/map/grid.ts'

type Point = [number, number]
type Box = [west: number, south: number, east: number, north: number]
type Geometry =
  | { type: 'Polygon'; coordinates: Point[][] }
  | { type: 'MultiPolygon'; coordinates: Point[][][] }
  | { type: 'LineString'; coordinates: Point[] }
  | { type: 'MultiLineString'; coordinates: Point[][] }
type Feature = { properties: Record<string, string | null>; geometry: Geometry | null }

const bayArea: Box = [-122.72, 37.22, -121.78, 38.0]
const sanFrancisco: Box = [-122.53, 37.7, -122.35, 37.84]

const island: Point[] = [
  [-122.7, 37.9],
  [-122.62, 37.95],
  [-122.55, 37.985],
  [-122.47, 37.99],
  [-122.38, 37.985],
  [-122.3, 37.975],
  [-122.22, 37.95],
  [-122.15, 37.9],
  [-122.1, 37.83],
  [-122.05, 37.75],
  [-121.97, 37.65],
  [-121.9, 37.55],
  [-121.82, 37.42],
  [-121.8, 37.32],
  [-121.88, 37.25],
  [-122.02, 37.26],
  [-122.15, 37.32],
  [-122.3, 37.38],
  [-122.42, 37.42],
  [-122.55, 37.5],
  [-122.6, 37.7],
  [-122.7, 37.8],
]

const sanPabloBay: Box = [-122.56, 37.92, -122.2, 38.0]

const sanFranciscoStreets = [
  'Market St',
  'Mission St',
  'Valencia St',
  'Van Ness Ave',
  'S Van Ness Ave',
  'Divisadero St',
  'Masonic Ave',
  'Stanyan St',
  'Geary Blvd',
  'California St',
  'Lombard St',
  'Fulton St',
  'Lincoln Way',
  'Judah St',
  '19th Ave',
  'Sunset Blvd',
  'Great Hwy',
  'The Embarcadero',
  '3rd St',
  'Cesar Chavez St',
  '16th St',
  '24th St',
  'Potrero Ave',
  'Bayshore Blvd',
  'Alemany Blvd',
  'Portola Dr',
  'Oak St',
  'Haight St',
  'Broadway',
  'Columbus Ave',
  'Bay St',
  'Folsom St',
  'Brannan St',
  'King St',
  'Post St',
  'Polk St',
  'Fillmore St',
  'Arguello Blvd',
  'Park Presidio Blvd',
  'Ocean Ave',
  'Geneva Ave',
  'Church St',
  'Castro St',
  'Chestnut St',
  'Marina Blvd',
  'Twin Peaks Blvd',
  'Powell St',
  'Hyde St',
  'Grant Ave',
  'Dolores St',
  'Lincoln Blvd',
  'John F Kennedy Dr',
  'Martin Luther King Jr Dr',
  'Evans Ave',
  'Mission Bay Blvd N',
  'Townsend St',
  '4th St',
]

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
  for (const [x, y] of simplify(warpAll(points), 0.6)) {
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

function onIsland([lon, lat]: Point): boolean {
  let inside = false
  island.forEach(([x0, y0], i) => {
    const [x1, y1] = island[(i + 1) % island.length]!
    if (y0 > lat !== y1 > lat && lon < x0 + ((lat - y0) / (y1 - y0)) * (x1 - x0)) inside = !inside
  })
  return inside
}

function densify(ring: Point[], step = 0.005): Point[] {
  return ring.flatMap(([x0, y0], i) => {
    const [x1, y1] = ring[(i + 1) % ring.length]!
    const parts = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / step))
    return Array.from({ length: parts }, (_, k): Point => [
      x0 + ((x1 - x0) * k) / parts,
      y0 + ((y1 - y0) * k) / parts,
    ])
  })
}

function wobble(ring: Point[]): Point[] {
  return ring.map(([lon, lat], i) => {
    const [before, after] = [
      ring[(i - 1 + ring.length) % ring.length]!,
      ring[(i + 1) % ring.length]!,
    ]
    const [tx, ty] = [after[0] - before[0], after[1] - before[1]]
    const length = Math.sqrt(tx * tx + ty * ty) || 1
    const t = (i / ring.length) * Math.PI * 2
    const amount =
      0.012 * Math.sin(t * 7) + 0.008 * Math.sin(t * 13 + 1) + 0.005 * Math.sin(t * 29 + 2)
    return [lon + (ty / length) * amount, lat - (tx / length) * amount]
  })
}

const boxRing = ([west, south, east, north]: Box): Point[] => [
  [west, south],
  [east, south],
  [east, north],
  [west, north],
]

function smoothCoast(grid: Uint8Array) {
  const wet = (kind: number) =>
    kind === groundKinds.indexOf('ocean') || kind === groundKinds.indexOf('water')
  for (let pass = 0; pass < 2; pass++) {
    const before = grid.slice()
    for (let y = 1; y < mapHeight - 1; y++) {
      for (let x = 1; x < mapWidth - 1; x++) {
        let dry = 0
        let ocean = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const kind = before[(y + dy) * mapWidth + x + dx]!
            if (!wet(kind)) dry++
            else if (kind === groundKinds.indexOf('ocean')) ocean++
          }
        }
        const i = y * mapWidth + x
        if (wet(before[i]!) && dry >= 6) grid[i] = groundKinds.indexOf('land')
        if (!wet(before[i]!) && dry <= 3) {
          grid[i] = groundKinds.indexOf(ocean * 2 > 9 - dry ? 'ocean' : 'water')
        }
      }
    }
  }
}

function clip(points: Point[], keep: (point: Point) => boolean): Point[][] {
  const pieces: Point[][] = [[]]
  for (const point of points) {
    if (keep(point)) pieces.at(-1)!.push(point)
    else if (pieces.at(-1)!.length) pieces.push([])
  }
  return pieces.filter((piece) => piece.length >= 2)
}

const polylines = (features: Feature[], keep = onIsland) =>
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
  layer(
    'Transportation/MapServer/8',
    sanFrancisco,
    `MTFCC='S1400' AND NAME IN (${sanFranciscoStreets.map((name) => `'${name}'`).join(',')})`,
  ),
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
fill(grid, [warpAll(densify(boxRing(sanPabloBay)))], 'land', 'water')
const inland = new Uint8Array(mapWidth * mapHeight)
fill(inland, [warpAll(wobble(densify(island)))], 'land')
inland.forEach((kind, i) => {
  if (!kind) grid[i] = groundKinds.indexOf('ocean')
})
smoothCoast(grid)
beaches(grid)

console.log(
  JSON.stringify({
    ground: runLengths(grid),
    roads: {
      freeway: polylines(freeways),
      street: [
        ...polylines(streets),
        ...polylines(main, (point) => onIsland(point) && !within(sanFrancisco)(point)),
      ],
      local: polylines(local, (point) => onIsland(point) && within(sanFrancisco)(point)),
    },
    named: Object.fromEntries(
      namedStreets.map((name) => [
        name,
        polylines(
          local.filter((feature) => feature.properties.NAME === name),
          (point) => onIsland(point) && within(sanFrancisco)(point),
        ),
      ]),
    ),
    rails: {
      bart: polylines(rail.filter((feature) => feature.properties.NAME === 'Bart')),
      caltrain: polylines(rail.filter((feature) => feature.properties.NAME === 'Caltrain')),
    },
  }),
)
