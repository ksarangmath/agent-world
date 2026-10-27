import { warp } from '../../shared/map/grid'

export const styles = {
  downtown: {
    heights: [2, 13],
    depth: 6,
    walls: ['#a9bccd', '#c9ccd1', '#d8cdb8', '#8195aa', '#e8e4da', '#64768a', '#b8a88a', '#dfe6ec'],
    roofs: ['#6f7378'],
    gables: 0,
  },
  midrise: {
    heights: [1, 2.1],
    depth: 3,
    walls: ['#efe6d2', '#e3d5b8', '#f4efe6', '#d9c6a5', '#cbb89a', '#e8d9c4', '#c4a484', '#f2e2c4'],
    roofs: ['#8a8580'],
    gables: 0,
  },
  victorian: {
    heights: [0.8, 1.2],
    depth: 2,
    walls: [
      '#f7f2e8',
      '#efe6d6',
      '#f3ece0',
      '#e9e4dc',
      '#f4c7cf',
      '#bfe0d4',
      '#bcd5ee',
      '#d9cbed',
      '#f6e7b4',
      '#f7cdb0',
      '#c8dfb8',
      '#f2dfc4',
    ],
    roofs: ['#8a8d92', '#93877f', '#7f858d'],
    gables: 0.35,
  },
  stucco: {
    heights: [0.6, 0.85],
    depth: 2,
    walls: ['#f6f1e7', '#efe8da', '#f4ece4', '#f1e4e2', '#e2ebf0', '#e8efe2', '#f5ecd6', '#ece8f0'],
    roofs: ['#9a948c'],
    gables: 0.1,
  },
  marina: {
    heights: [0.8, 1.1],
    depth: 2,
    walls: ['#f7efe2', '#f1dfc4', '#f4d6c6', '#e9e3d3', '#fbf6ec'],
    roofs: ['#b5523b', '#c0643f'],
    gables: 0.6,
  },
  industrial: {
    heights: [0.7, 1.4],
    depth: 5,
    walls: ['#a65c45', '#8c8c8c', '#b9a58a', '#7a6a5a', '#9e4f3c', '#c2b8a3', '#b0b4b8'],
    roofs: ['#6d6a66'],
    gables: 0.15,
  },
  suburb: {
    heights: [0.5, 0.7],
    depth: 1,
    walls: ['#efe6d8', '#d9d2c3', '#c9d3d9', '#e8dcc2', '#f2efe8', '#d8c3a5', '#e2d6e6'],
    roofs: ['#6b4f3f', '#5a5f66', '#7a3e2e', '#4e5b4e'],
    gables: 0.85,
  },
  campus: {
    heights: [0.9, 1.5],
    depth: 3,
    walls: ['#e3c79a', '#d9b98a', '#efd9b0'],
    roofs: ['#b5523b'],
    gables: 0.8,
  },
} as const

export type Style = keyof typeof styles

type Neighborhood = {
  name: string
  x: number
  y: number
  style: Style
  label: 'major' | 'minor' | null
}

const list: [name: string, lat: number, lon: number, style: Style, label?: 'major' | 'hidden'][] = [
  ['Financial District', 37.7946, -122.3999, 'downtown', 'major'],
  ['East Cut', 37.789, -122.394, 'downtown'],
  ['Union Square', 37.788, -122.4075, 'downtown'],
  ['SoMa', 37.7785, -122.4056, 'industrial', 'major'],
  ['Chinatown', 37.7941, -122.4078, 'midrise'],
  ['North Beach', 37.8, -122.41, 'midrise'],
  ['Telegraph Hill', 37.8015, -122.405, 'midrise', 'hidden'],
  ['Russian Hill', 37.801, -122.419, 'midrise'],
  ['Nob Hill', 37.792, -122.415, 'midrise'],
  ['Tenderloin', 37.784, -122.414, 'midrise'],
  ['Civic Center', 37.779, -122.418, 'midrise'],
  ['Hayes Valley', 37.776, -122.424, 'victorian'],
  ['Western Addition', 37.781, -122.433, 'victorian'],
  ['Japantown', 37.785, -122.43, 'midrise', 'hidden'],
  ['Pacific Heights', 37.7925, -122.435, 'victorian'],
  ['Marina', 37.802, -122.437, 'marina', 'major'],
  ['Cow Hollow', 37.798, -122.437, 'victorian', 'hidden'],
  ['Presidio Heights', 37.788, -122.452, 'victorian', 'hidden'],
  ['Richmond', 37.78, -122.48, 'stucco', 'major'],
  ['Sunset', 37.754, -122.49, 'stucco', 'major'],
  ['Haight-Ashbury', 37.769, -122.447, 'victorian', 'major'],
  ['Cole Valley', 37.765, -122.45, 'victorian', 'hidden'],
  ['Castro', 37.7609, -122.435, 'victorian', 'major'],
  ['Noe Valley', 37.7502, -122.4337, 'victorian'],
  ['Mission', 37.7599, -122.4148, 'victorian', 'major'],
  ['Bernal Heights', 37.739, -122.4156, 'victorian'],
  ['Potrero Hill', 37.758, -122.4, 'victorian'],
  ['Dogpatch', 37.758, -122.389, 'industrial'],
  ['Mission Bay', 37.77, -122.392, 'midrise'],
  ['Bayview', 37.73, -122.39, 'industrial', 'major'],
  ['Excelsior', 37.724, -122.425, 'stucco'],
  ['Glen Park', 37.734, -122.433, 'victorian', 'hidden'],
  ['West Portal', 37.74, -122.466, 'stucco', 'hidden'],
  ['Twin Peaks', 37.752, -122.448, 'stucco', 'major'],
  ['Parkmerced', 37.72, -122.48, 'stucco', 'hidden'],
  ['Visitacion Valley', 37.713, -122.404, 'stucco', 'hidden'],
  ["Fisherman's Wharf", 37.808, -122.417, 'industrial', 'major'],
  ['Embarcadero', 37.799, -122.398, 'midrise', 'hidden'],
  ['Treasure Island', 37.8235, -122.3707, 'industrial', 'major'],
  ['Presidio', 37.7989, -122.4662, 'marina', 'major'],
  ['Sausalito', 37.859, -122.485, 'suburb', 'major'],
  ['Tiburon', 37.8735, -122.4566, 'suburb'],
  ['Mill Valley', 37.906, -122.545, 'suburb'],
  ['Oakland', 37.8044, -122.2712, 'downtown', 'major'],
  ['Jack London Square', 37.795, -122.276, 'industrial', 'hidden'],
  ['West Oakland', 37.81, -122.29, 'victorian', 'hidden'],
  ['Port of Oakland', 37.799, -122.315, 'industrial'],
  ['Berkeley', 37.8715, -122.273, 'midrise', 'major'],
  ['Emeryville', 37.8313, -122.2852, 'midrise', 'hidden'],
  ['Alameda', 37.7652, -122.2416, 'victorian'],
  ['Rockridge', 37.824, -122.231, 'suburb', 'hidden'],
  ['Daly City', 37.6879, -122.4702, 'stucco', 'major'],
  ['South San Francisco', 37.6547, -122.4077, 'industrial'],
  ['San Mateo', 37.563, -122.3255, 'suburb'],
  ['Redwood City', 37.4852, -122.2364, 'suburb'],
  ['Palo Alto', 37.4419, -122.143, 'suburb', 'major'],
  ['Stanford', 37.4275, -122.1697, 'campus'],
  ['Menlo Park', 37.453, -122.1817, 'suburb'],
  ['Mountain View', 37.3861, -122.0839, 'suburb', 'major'],
  ['Sunnyvale', 37.3688, -122.0363, 'suburb'],
  ['Santa Clara', 37.3541, -121.9552, 'suburb'],
  ['San Jose', 37.3382, -121.8863, 'downtown', 'major'],
  ['Fremont', 37.5485, -121.9886, 'suburb'],
  ['Hayward', 37.6688, -122.0808, 'suburb'],
  ['San Leandro', 37.7249, -122.1561, 'suburb', 'hidden'],
  ['Richmond Hills', 37.9358, -122.3478, 'industrial', 'hidden'],
  ['Albany', 37.89, -122.3, 'suburb', 'hidden'],
]

export const neighborhoods: Neighborhood[] = list.map(([name, lat, lon, style, tier]) => {
  const [x, y] = warp(lon, lat)
  return { name, x, y, style, label: tier === 'hidden' ? null : (tier ?? 'minor') }
})

export function neighborhoodAt(x: number, y: number): Neighborhood {
  let best = neighborhoods[0]!
  let bestDistance = Infinity
  for (const neighborhood of neighborhoods) {
    const d = (neighborhood.x - x) ** 2 + (neighborhood.y - y) ** 2
    if (d < bestDistance) [best, bestDistance] = [neighborhood, d]
  }
  return best
}
