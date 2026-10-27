import { mapHeight, mapWidth, roadTiles } from './route'

export const tileKinds = ['water', 'land', 'park', 'sand', 'road', 'bridge'] as const
export type TileKind = (typeof tileKinds)[number]

type Polygon = readonly (readonly [number, number])[]

const land: Polygon[] = [
  [
    [22, 76],
    [34, 72],
    [52, 70],
    [70, 70],
    [90, 68],
    [108, 66],
    [124, 70],
    [136, 76],
    [140, 90],
    [140, 104],
    [138, 118],
    [134, 130],
    [130, 140],
    [128, 152],
    [134, 164],
    [146, 174],
    [160, 180],
    [160, 192],
    [70, 192],
    [76, 176],
    [80, 160],
    [76, 148],
    [30, 142],
    [24, 128],
    [22, 110],
    [20, 92],
  ],
  [
    [150, 176],
    [200, 174],
    [230, 166],
    [250, 150],
    [256, 150],
    [256, 192],
    [150, 192],
  ],
  [
    [166, 8],
    [256, 4],
    [256, 154],
    [234, 160],
    [214, 150],
    [196, 134],
    [184, 116],
    [178, 96],
    [174, 72],
    [170, 44],
  ],
  [
    [12, 10],
    [64, 4],
    [112, 6],
    [120, 28],
    [112, 44],
    [104, 54],
    [86, 56],
    [66, 58],
    [52, 58],
    [36, 54],
    [18, 44],
    [8, 26],
  ],
  [
    [152, 80],
    [158, 80],
    [158, 87],
    [152, 87],
  ],
]

const parks: Polygon[] = [
  [
    [34, 74],
    [58, 72],
    [60, 86],
    [36, 88],
  ],
  [
    [26, 100],
    [82, 100],
    [82, 107],
    [26, 107],
  ],
  [
    [16, 12],
    [70, 8],
    [80, 30],
    [60, 48],
    [24, 42],
  ],
  [
    [226, 20],
    [250, 18],
    [252, 60],
    [230, 64],
  ],
]

const sand: Polygon[] = [
  [
    [20, 92],
    [24, 92],
    [25, 140],
    [21, 140],
  ],
]

function fill(grid: Uint8Array, polygon: Polygon, kind: TileKind) {
  const value = tileKinds.indexOf(kind)
  for (let y = 0; y < mapHeight; y++) {
    const center = y + 0.5
    const crossings = polygon
      .flatMap(([x0, y0], i) => {
        const [x1, y1] = polygon[(i + 1) % polygon.length]!
        const crosses = (y0 <= center && y1 > center) || (y1 <= center && y0 > center)
        return crosses ? [x0 + ((center - y0) / (y1 - y0)) * (x1 - x0)] : []
      })
      .sort((a, b) => a - b)
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const start = Math.max(0, Math.ceil(crossings[i]! - 0.5))
      const end = Math.min(mapWidth, Math.ceil(crossings[i + 1]! - 0.5))
      grid.fill(value, y * mapWidth + start, y * mapWidth + end)
    }
  }
}

function build(): Uint8Array {
  const grid = new Uint8Array(mapWidth * mapHeight)
  for (const polygon of land) fill(grid, polygon, 'land')
  for (const polygon of parks) fill(grid, polygon, 'park')
  for (const polygon of sand) fill(grid, polygon, 'sand')
  for (const tile of roadTiles) {
    grid[tile] = tileKinds.indexOf(grid[tile] === 0 ? 'bridge' : 'road')
  }
  return grid
}

export const terrain: Uint8Array = build()

export const tileKind = (x: number, y: number): TileKind => tileKinds[terrain[y * mapWidth + x]!]!
