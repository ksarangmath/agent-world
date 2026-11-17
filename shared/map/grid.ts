import type { Metro } from '../metros'

export const mapWidth = 456
export const mapHeight = 504

export const groundKinds = ['ocean', 'water', 'land', 'park', 'sand', 'campus'] as const
export type GroundKind = (typeof groundKinds)[number]

type Projection = {
  center: { lon: number; lat: number }
  origin: { x: number; y: number }
  kmPerDegreeLon: number
  kmPerDegreeLat: number
  trueToScaleKm: number
  westSide?: { lon: number; squeeze: number }
}
export type Warp = (lon: number, lat: number) => [x: number, y: number]

const falloffKm = 1
const tilesPerKm = 14

function projection({
  center,
  origin,
  kmPerDegreeLon,
  kmPerDegreeLat,
  trueToScaleKm,
  westSide,
}: Projection): Warp {
  return (lon, lat) => {
    const compact =
      westSide && lon < westSide.lon ? westSide.lon + (lon - westSide.lon) * westSide.squeeze : lon
    const x = (compact - center.lon) * kmPerDegreeLon
    const y = (center.lat - lat) * kmPerDegreeLat
    const r = Math.sqrt(x * x + y * y)
    const squeezed =
      r <= trueToScaleKm
        ? r
        : trueToScaleKm +
          2 *
            Math.sqrt(falloffKm) *
            (Math.sqrt(r - trueToScaleKm + falloffKm) - Math.sqrt(falloffKm))
    const scale = r === 0 ? tilesPerKm : (squeezed / r) * tilesPerKm
    return [origin.x + x * scale, origin.y + y * scale]
  }
}

export const warps: Record<Metro, Warp> = {
  bay: projection({
    center: { lon: -122.435, lat: 37.77 },
    origin: { x: 187, y: 225 },
    kmPerDegreeLon: 88,
    kmPerDegreeLat: 110.95,
    trueToScaleKm: 7.5,
    westSide: { lon: -122.465, squeeze: 0.6 },
  }),
  austin: projection({
    center: { lon: -97.7431, lat: 30.2672 },
    origin: { x: 232, y: 250 },
    kmPerDegreeLon: 96.1,
    kmPerDegreeLat: 110.86,
    trueToScaleKm: 7.5,
  }),
}
