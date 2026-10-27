const center = { lon: -122.435, lat: 37.77 }
const westSide = { lon: -122.465, squeeze: 0.6 }
const kmPerDegreeLon = 88
const kmPerDegreeLat = 110.95
const trueToScaleKm = 7.5
const falloffKm = 1
const tilesPerKm = 14
const origin = { x: 187, y: 225 }

export const mapWidth = 456
export const mapHeight = 504

export function warp(lon: number, lat: number): [x: number, y: number] {
  const compact = lon < westSide.lon ? westSide.lon + (lon - westSide.lon) * westSide.squeeze : lon
  const x = (compact - center.lon) * kmPerDegreeLon
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
