import { rename, writeFile } from 'node:fs/promises'
import { groundKinds, mapHeight, mapWidth, warps, type GroundKind } from '../shared/map/grid.ts'
import { isMetro } from '../shared/metros.ts'
import { sources, type Box, type Point } from './sources.ts'

type Geometry =
  | { type: 'Polygon'; coordinates: Point[][] }
  | { type: 'MultiPolygon'; coordinates: Point[][][] }
  | { type: 'LineString'; coordinates: Point[] }
  | { type: 'MultiLineString'; coordinates: Point[][] }
type Feature = { properties: Record<string, string | null>; geometry: Geometry | null }

const [metro, out] = process.argv.slice(2)
if (!isMetro(metro)) throw new Error(`Usage: pnpm map <${Object.keys(sources).join(' | ')}>`)
const source = sources[metro]
const warp = warps[metro]
const island = source.island

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

function swell(grid: Uint8Array, tiles: number) {
  const water = groundKinds.indexOf('water')
  const soft = [groundKinds.indexOf('land'), groundKinds.indexOf('park')]
  for (let pass = 0; pass < tiles; pass++) {
    const before = grid.slice()
    for (let y = 1; y < mapHeight - 1; y++) {
      for (let x = 1; x < mapWidth - 1; x++) {
        const i = y * mapWidth + x
        if (!soft.includes(before[i]!)) continue
        const beside = [i - 1, i + 1, i - mapWidth, i + mapWidth]
        if (beside.some((n) => before[n] === water)) grid[i] = water
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

const quoted = (names: string[]) => names.map((name) => `'${name.replaceAll("'", "''")}'`).join(',')

const [counties, water, nps, colleges, freeways, streets, rail, local, main] = await Promise.all([
  layer('State_County/MapServer/1', source.box, `STATE='${source.state}'`),
  layer('Hydro/MapServer/1', source.box, source.water),
  layer('Special_Land_Use_Areas/MapServer/0', source.box),
  layer('Special_Land_Use_Areas/MapServer/2', source.box),
  layer('Transportation/MapServer/2', source.box),
  layer('Transportation/MapServer/6', source.box),
  layer(
    'Transportation/MapServer/9',
    source.box,
    `NAME IN (${quoted(Object.values(source.rails))})`,
  ),
  layer(
    'Transportation/MapServer/8',
    source.city,
    `MTFCC='S1400' AND NAME IN (${quoted(source.cityStreets)})`,
  ),
  layer(
    'Transportation/MapServer/8',
    source.box,
    `MTFCC='S1400' AND NAME IN (${quoted(source.mainStreets)})`,
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
for (const park of source.parks) fill(grid, [warpAll(boxRing(park))], 'park', 'land')
for (const college of colleges) {
  if (!source.campuses.includes(college.properties.NAME ?? '')) continue
  for (const polygon of polygons(college.geometry)) {
    fill(grid, polygon.map(warpAll), 'campus', 'land')
  }
}
for (const area of water) {
  const kind = area.properties.MTFCC === 'H2053' ? 'ocean' : 'water'
  if (area.properties.MTFCC !== 'H2030' && area.properties.MTFCC !== 'H2040') continue
  for (const polygon of polygons(area.geometry)) fill(grid, polygon.map(warpAll), kind)
}
swell(grid, source.swell)
for (const box of source.landfill) fill(grid, [warpAll(densify(boxRing(box)))], 'land', 'water')
const inland = new Uint8Array(mapWidth * mapHeight)
fill(inland, [warpAll(wobble(densify(island)))], 'land')
inland.forEach((kind, i) => {
  if (!kind) grid[i] = groundKinds.indexOf('ocean')
})
smoothCoast(grid)
beaches(grid)

const inCity = within(source.city)
const geography = JSON.stringify({
  ground: runLengths(grid),
  roads: {
    freeway: polylines(freeways),
    street: [
      ...polylines(streets),
      ...polylines(main, (point) => onIsland(point) && !inCity(point)),
    ],
    local: polylines(local, (point) => onIsland(point) && inCity(point)),
  },
  named: Object.fromEntries(
    source.namedStreets.map((name) => [
      name,
      polylines(
        local.filter((feature) => feature.properties.NAME === name),
        (point) => onIsland(point) && inCity(point),
      ),
    ]),
  ),
  rails: Object.fromEntries(
    Object.entries(source.rails).map(([key, name]) => [
      key,
      polylines(rail.filter((feature) => feature.properties.NAME === name)),
    ]),
  ),
})
const path = out ?? new URL(`../shared/map/${metro}/geography.json`, import.meta.url).pathname
await writeFile(`${path}.tmp`, `${geography}\n`)
await rename(`${path}.tmp`, path)
console.log(`Wrote ${path}`)
