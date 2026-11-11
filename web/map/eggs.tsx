import { useMemo } from 'react'
import { warp } from '../../shared/map/grid'
import { accessRoad } from '../../shared/map/route'
import { surfaceAt } from './decks'
import { journey, roadEdges } from './roads'
import { box, makePath, model, sample, Vehicles, type Fleet, type Pose } from './traffic'

const road = (lon: number, lat: number) => {
  const [x, y] = warp(lon, lat)
  const tile = accessRoad({ x: Math.round(x), y: Math.round(y) })
  return { x: tile.x + 0.5, z: tile.y + 0.5 }
}
const stand = (out: Pose, x: number, z: number, lift = 0) => {
  out.x = x
  out.z = z
  out.y = surfaceAt(x, z) + lift
}

const cat = (fur: string) =>
  model(
    box(0.4, 0.15, 0.15, 0, 0.07, 0, fur),
    box(0.15, 0.15, 0.15, 0.25, 0.13, 0, fur),
    box(0.045, 0.06, 0.045, 0.28, 0.28, 0.045, fur),
    box(0.045, 0.06, 0.045, 0.28, 0.28, -0.045, fur),
    box(0.045, 0.24, 0.045, -0.21, 0.15, 0, fur),
  )

function catFight(): Fleet[] {
  const alley = road(-122.4862, 37.7533)
  const fighters = ['#2b2b2f', '#e08a3c']
  const squaring = (seconds: number) => seconds % 14 < 9
  return [
    ...fighters.map((fur, n): Fleet => ({
      count: 1,
      model: cat(fur),
      place: (_, seconds, out) => {
        const around = seconds * (squaring(seconds) ? 3.2 : 0.4) + n * Math.PI
        stand(
          out,
          alley.x + 0.3 * Math.cos(around),
          alley.z + 0.3 * Math.sin(around),
          squaring(seconds) ? 0.12 * Math.abs(Math.sin(seconds * 9 + n)) : 0,
        )
        out.heading = Math.PI - around
      },
    })),
    {
      count: 3,
      model: model(box(0.16, 0.12, 0.16, 0, 0.02, 0, '#e9e4da')),
      place: (i, seconds, out) => {
        const puff = seconds * 2.3 + i * 2.1
        stand(out, alley.x + 0.3 * Math.cos(puff), alley.z + 0.3 * Math.sin(puff * 1.3), 0.05)
        out.scale = squaring(seconds) ? 0.5 + 0.5 * Math.abs(Math.sin(puff * 1.7)) : 0
      },
    },
  ]
}

function hydrant(): Fleet[] {
  const corner = road(-122.427, 37.748)
  const [x, z] = [corner.x + 0.25, corner.z]
  const drops = 9
  return [
    {
      count: 1,
      model: model(
        box(0.12, 0.2, 0.12, 0, 0, 0, '#d8402f'),
        box(0.16, 0.05, 0.16, 0, 0.2, 0, '#b8301f'),
        box(0.22, 0.06, 0.06, 0, 0.1, 0, '#d8402f'),
        box(0.9, 0.012, 0.7, 0.2, 0, 0.1, '#6fc3ee'),
      ),
      place: (_, __, out) => stand(out, x, z),
    },
    {
      count: drops,
      model: model(box(0.07, 0.07, 0.07, 0, 0, 0, '#9fdcf7')),
      place: (i, seconds, out) => {
        const flight = (seconds * 0.9 + i / drops) % 1
        const spread = 0.5 * flight * (0.6 + 0.4 * Math.sin(i * 2.4))
        stand(
          out,
          x + spread * Math.cos(i * 1.9),
          z + spread * Math.sin(i * 1.9),
          0.25 + 2.6 * flight * (1 - flight),
        )
      },
    },
  ]
}

function driverlessTaxi(): Fleet[] {
  const start = roadEdges.findIndex(({ line }) => line.length > 6)
  const path = makePath(journey(start, 404, 260), 0.5)
  const pondering = 22
  const drive = (seconds: number, out: Pose) => {
    const lap = seconds % (path.length / 1.6 + pondering)
    sample(path, Math.max(0, lap - pondering) * 1.6, out)
    out.y = surfaceAt(out.x, out.z)
  }
  return [
    {
      count: 1,
      model: model(
        box(0.6, 0.14, 0.28, 0, 0.05, 0, '#f6f7f9'),
        box(0.34, 0.1, 0.25, -0.02, 0.19, 0, '#27313d'),
        box(0.36, 0.02, 0.26, -0.02, 0.29, 0, '#f6f7f9'),
        box(0.08, 0.06, 0.08, 0.26, 0.19, 0.11, '#30343b'),
        box(0.08, 0.06, 0.08, 0.26, 0.19, -0.11, '#30343b'),
      ),
      glow: model(box(0.02, 0.05, 0.2, 0.3, 0.1, 0, '#fff3c4')),
      place: (_, seconds, out) => drive(seconds, out),
    },
    {
      count: 1,
      model: model(
        box(0.12, 0.08, 0.12, 0, 0, 0, '#30343b'),
        box(0.05, 0.04, 0.16, 0, 0.02, 0, '#7df9ff'),
      ),
      place: (_, seconds, out) => {
        drive(seconds, out)
        out.y += 0.31
        out.heading = seconds * 5
      },
    },
  ]
}

function manInBlack(): Fleet[] {
  const corners = [road(-122.4089, 37.7936), road(-122.4372, 37.801), road(-122.1432, 37.4419)]
  const lookout = (i: number, seconds: number) => Math.max(0, Math.sin(seconds * 0.35 + i * 2)) ** 3
  return [
    {
      count: corners.length,
      model: model(
        box(0.3, 0.62, 0.3, 0, 0, 0, '#8d6e54'),
        box(0.34, 0.04, 0.34, 0, 0.62, 0, '#6f543e'),
      ),
      place: (i, _, out) => stand(out, corners[i]!.x + 0.4, corners[i]!.z + 0.4),
    },
    {
      count: corners.length,
      model: model(
        box(0.12, 0.3, 0.16, 0, 0, 0, '#16171b'),
        box(0.1, 0.1, 0.12, 0, 0.3, 0, '#e3b48f'),
        box(0.104, 0.03, 0.124, 0, 0.345, 0, '#0b0b0d'),
        box(0.124, 0.12, 0.03, 0, 0.16, 0, '#f4f4f4'),
        box(0.126, 0.1, 0.012, 0, 0.17, 0, '#16171b'),
      ),
      place: (i, seconds, out) => {
        stand(out, corners[i]!.x + 0.4, corners[i]!.z + 0.4 + 0.1 + 0.2 * lookout(i, seconds))
        out.heading = Math.PI / 2
      },
    },
  ]
}

function oceanWatcher(): Fleet[] {
  const [streetX, streetZ] = warp(-122.5095, 37.7605)
  const [shoreX, shoreZ] = warp(-122.5128, 37.7605)
  const [outing, gazing] = [70, 45]
  const trip = (seconds: number) => {
    const moment = seconds % (outing * 2 + gazing * 2)
    return moment < outing
      ? moment / outing
      : moment < outing + gazing
        ? 1
        : moment < outing * 2 + gazing
          ? 1 - (moment - outing - gazing) / outing
          : 0
  }
  return [
    {
      count: 1,
      model: model(
        box(0.22, 0.14, 0.16, 0, 0.05, 0, '#f6f7f9'),
        box(0.24, 0.03, 0.18, 0, 0.19, 0, '#ff8a3c'),
        box(0.012, 0.3, 0.012, -0.08, 0.19, 0.05, '#30343b'),
        box(0.08, 0.05, 0.01, -0.04, 0.44, 0.05, '#ff5d5d'),
        box(0.02, 0.04, 0.1, 0.11, 0.1, 0, '#7df9ff'),
      ),
      place: (_, seconds, out) => {
        const along = trip(seconds)
        stand(out, streetX + (shoreX - streetX) * along, streetZ + (shoreZ - streetZ) * along)
        out.heading = along === 1 || along > trip(seconds - 1) ? Math.PI : 0
      },
    },
  ]
}

export function Eggs() {
  const fleets = useMemo(
    () => [...catFight(), ...hydrant(), ...driverlessTaxi(), ...manInBlack(), ...oceanWatcher()],
    [],
  )
  return fleets.map((fleet, i) => <Vehicles key={i} fleet={fleet} />)
}
