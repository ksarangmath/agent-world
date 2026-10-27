const center = { lon: -122.435, lat: 37.77 }
const kmPerDegreeLon = 88
const kmPerDegreeLat = 110.95
const trueToScaleKm = 7.5
const falloffKm = 2
const tilesPerKm = 36
const origin = { x: 380, y: 440 }

export const mapWidth = 1100
export const mapHeight = 1180

export function warp(lon: number, lat: number): [x: number, y: number] {
  const x = (lon - center.lon) * kmPerDegreeLon
  const y = (center.lat - lat) * kmPerDegreeLat
  const r = Math.sqrt(x * x + y * y)
  const squeezed =
    r <= trueToScaleKm
      ? r
      : trueToScaleKm +
        2 * Math.sqrt(falloffKm) * (Math.sqrt(r - trueToScaleKm + falloffKm) - Math.sqrt(falloffKm))
  const scale = r === 0 ? tilesPerKm : (squeezed / r) * tilesPerKm
  return [origin.x + x * scale, origin.y + y * scale]
}

export const groundKinds = ['ocean', 'water', 'land', 'park', 'sand', 'campus'] as const
export type GroundKind = (typeof groundKinds)[number]
