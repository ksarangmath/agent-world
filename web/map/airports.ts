import type { Metro } from '../../shared/metros'
import { metro } from '../metro'

type LatLon = [lat: number, lon: number]

const airports: Record<
  Metro,
  { landing: [touchdown: LatLon, rollout: LatLon]; takeoff: [start: LatLon, liftoff: LatLon] }
> = {
  bay: {
    landing: [
      [37.6136, -122.3577],
      [37.6286, -122.3934],
    ],
    takeoff: [
      [37.6061, -122.3815],
      [37.627, -122.3705],
    ],
  },
  austin: {
    landing: [
      [30.18, -97.6785],
      [30.2136, -97.6794],
    ],
    takeoff: [
      [30.1791, -97.6573],
      [30.2038, -97.6579],
    ],
  },
}

export const airport = airports[metro]
