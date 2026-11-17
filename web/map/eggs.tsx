import { useMemo } from 'react'
import { surfaceAt } from './decks'
import { journey, roadEdges } from './roads'
import { box, makePath, model, sample, Vehicles, type Fleet, type Pose } from './traffic'
import type { Metro } from '../../shared/metros'
import { metro } from '../metro'
import { accessRoad, warp } from './atlas'
import { downstream } from './course'
import { peacockSite } from './landmarks/austin'

type LonLat = [lon: number, lat: number]

const scenes: Record<
  Metro,
  { alley: LonLat; hydrant: LonLat; corners: LonLat[]; watcher: [street: LonLat, shore: LonLat] }
> = {
  bay: {
    alley: [-122.4862, 37.7533],
    hydrant: [-122.427, 37.748],
    corners: [
      [-122.4089, 37.7936],
      [-122.4372, 37.801],
      [-122.1432, 37.4419],
    ],
    watcher: [
      [-122.5095, 37.7605],
      [-122.5128, 37.7605],
    ],
  },
  austin: {
    alley: [-97.7214, 30.2632],
    hydrant: [-97.7296, 30.3064],
    corners: [
      [-97.7363, 30.2761],
      [-97.721, 30.3936],
      [-97.7578, 30.22],
      [-97.8888, 30.0976],
    ],
    watcher: [
      [-97.7115, 30.2456],
      [-97.7115, 30.2482],
    ],
  },
}

const scene = scenes[metro]

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
  const alley = road(...scene.alley)
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
  const corner = road(...scene.hydrant)
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
  const corners = scene.corners.map((corner) => road(...corner))
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
  const [streetX, streetZ] = warp(...scene.watcher[0])
  const [shoreX, shoreZ] = warp(...scene.watcher[1])
  const toward = Math.atan2(streetZ - shoreZ, shoreX - streetX)
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
        out.heading = along === 1 || along > trip(seconds - 1) ? toward : toward - Math.PI
      },
    },
  ]
}

function peacocks(): Fleet[] {
  const { x: cx, y: cz } = peacockSite()
  const [every, lasts] = [26, 10]
  const showing = (seconds: number) => seconds % every < lasts
  const strut = (i: number, seconds: number, out: Pose) => {
    const turn = (i % 2 ? 1 : -1) * 0.22
    const around = seconds * turn + i * 2.1
    const reach = 0.28 + 0.16 * i
    stand(out, cx + reach * Math.cos(around), cz + reach * Math.sin(around))
    out.heading = Math.atan2(-Math.cos(around) * turn, -Math.sin(around) * turn)
  }
  const display = (out: Pose) => {
    stand(out, cx, cz)
    out.heading = -Math.PI / 2
  }
  return [
    {
      count: 3,
      model: model(
        box(0.22, 0.13, 0.12, 0, 0.12, 0, '#1b6ca8'),
        box(0.05, 0.2, 0.05, 0.1, 0.2, 0, '#1b6ca8'),
        box(0.08, 0.06, 0.06, 0.12, 0.38, 0, '#1b6ca8'),
        box(0.02, 0.07, 0.06, 0.11, 0.44, 0, '#2ec4b6'),
        box(0.04, 0.02, 0.03, 0.18, 0.4, 0, '#f2cc8f'),
        box(0.02, 0.12, 0.02, 0.02, 0, 0.03, '#8d6e54'),
        box(0.02, 0.12, 0.02, 0.02, 0, -0.03, '#8d6e54'),
        box(0.46, 0.05, 0.1, -0.32, 0.13, 0, '#2a9d6f'),
      ),
      place: (i, seconds, out) => {
        if (i === 0 && showing(seconds)) display(out)
        else strut(i, seconds, out)
      },
    },
    {
      count: 1,
      model: model(
        box(0.04, 0.5, 0.74, -0.1, 0.14, 0, '#2a9d6f'),
        ...[-0.26, 0, 0.26].map((z) => box(0.05, 0.08, 0.08, -0.1, 0.5, z, '#1b6ca8')),
        ...[-0.13, 0.13].map((z) => box(0.05, 0.08, 0.08, -0.1, 0.32, z, '#ffd166')),
      ),
      place: (_, seconds, out) => {
        display(out)
        const since = seconds % every
        out.scale = showing(seconds) ? Math.min(1, since, lasts - since) : 0
      },
    },
  ]
}

function armadillo(): Fleet[] {
  const [ax, az] = warp(-97.7885, 30.2005)
  let [start, nearest] = [0, Infinity]
  roadEdges.forEach(({ line, roadClass }, n) => {
    if (roadClass === 'freeway') return
    for (let p = 0; p < line.length; p += 2) {
      const away = (line[p]! - ax) ** 2 + (line[p + 1]! - az) ** 2
      if (away < nearest) [start, nearest] = [n, away]
    }
  })
  const path = makePath(journey(start, 9, 24), 0.5)
  const [pace, sniffing, shoulder] = [0.3, 7, 0.44]
  const there = path.length / pace
  return [
    {
      count: 1,
      model: model(
        box(0.3, 0.13, 0.2, 0, 0.04, 0, '#8d8478'),
        ...[-0.08, 0, 0.08].map((x) => box(0.025, 0.14, 0.21, x, 0.04, 0, '#6f675c')),
        box(0.12, 0.07, 0.1, 0.2, 0.04, 0, '#a39a8c'),
        box(0.07, 0.04, 0.05, 0.29, 0.04, 0, '#a39a8c'),
        box(0.02, 0.06, 0.03, 0.17, 0.11, 0.03, '#a39a8c'),
        box(0.02, 0.06, 0.03, 0.17, 0.11, -0.03, '#a39a8c'),
        box(0.16, 0.03, 0.03, -0.22, 0.05, 0, '#a39a8c'),
      ),
      place: (_, seconds, out) => {
        const moment = seconds % (2 * (there + sniffing))
        const back = moment >= there + sniffing
        const walked = back ? moment - there - sniffing : moment
        const moving = walked < there
        const along = Math.min(walked, there) * pace
        sample(path, back ? path.length - along : along, out)
        if (back) out.heading += Math.PI
        out.x += Math.sin(out.heading) * shoulder
        out.z += Math.cos(out.heading) * shoulder
        out.y = surfaceAt(out.x, out.z) + (moving ? 0.015 * Math.abs(Math.sin(seconds * 9)) : 0)
        out.pitch = moving ? 0 : 0.25 * Math.max(0, Math.sin(seconds * 3))
      },
    },
  ]
}

function tubers(): Fleet[] {
  const path = makePath(downstream(warp(-97.7865, 30.2899), 30).flat())
  const float = { tubes: 7, gap: 0.6, speed: 0.22, rest: 4 }
  const drift = (i: number, seconds: number, out: Pose) => {
    const lap = path.length + float.rest
    const along = (((seconds * float.speed - i * float.gap) % lap) + lap) % lap
    sample(path, along, out)
    out.y = 0.02 + 0.02 * Math.sin(seconds * 1.4 + i)
    out.heading += 0.5 * Math.sin(seconds * 0.3 + i * 1.3)
    out.scale = along < path.length ? Math.min(1, along, path.length - along) : 0
  }
  const colors = ['#ff5d5d', '#ffd166', '#06d6a0', '#4cc9f0', '#b28dff', '#ff8fab']
  return [
    {
      count: float.tubes,
      model: model(
        box(0.36, 0.09, 0.36, 0, 0, 0, '#ffffff'),
        box(0.17, 0.095, 0.17, 0, 0, 0, '#10202c'),
      ),
      colors: Array.from({ length: float.tubes }, (_, i) => colors[i % colors.length]!),
      place: drift,
    },
    {
      count: float.tubes - 1,
      model: model(
        box(0.1, 0.1, 0.1, 0.13, 0.09, 0, '#e3b48f'),
        box(0.26, 0.06, 0.12, -0.04, 0.08, 0, '#f4f1ea'),
      ),
      place: drift,
    },
    {
      count: 1,
      model: model(
        box(0.2, 0.12, 0.14, 0, 0.08, 0, '#e63946'),
        box(0.21, 0.03, 0.15, 0, 0.2, 0, '#f4f1ea'),
      ),
      place: (_, seconds, out) => drift(float.tubes - 1, seconds, out),
    },
  ]
}

const locals: Record<Metro, () => Fleet[]> = {
  bay: () => [],
  austin: () => [...peacocks(), ...armadillo(), ...tubers()],
}

export function Eggs() {
  const fleets = useMemo(
    () => [
      ...catFight(),
      ...hydrant(),
      ...driverlessTaxi(),
      ...manInBlack(),
      ...oceanWatcher(),
      ...locals[metro](),
    ],
    [],
  )
  return fleets.map((fleet, i) => <Vehicles key={i} fleet={fleet} />)
}
