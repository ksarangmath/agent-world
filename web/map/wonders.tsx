import { useMemo } from 'react'
import { BoxGeometry, CatmullRomCurve3, Vector3 } from 'three'
import { sky } from './clock'
import { hash } from './elevation'
import { colored } from './paint'
import { box, makePath, model, sample, Vehicles, type Fleet } from './traffic'

const dark = () => sky.daylight.value < 0.35
const slanted = (
  w: number,
  h: number,
  d: number,
  lean: number,
  x: number,
  y: number,
  z: number,
  hex: string,
) => colored(new BoxGeometry(w, h, d).rotateZ(lean).translate(x, y, z), hex)

const models = {
  balloon: model(
    box(0.22, 0.16, 0.22, 0, 0, 0, '#9a6a3a'),
    box(0.5, 0.25, 0.5, 0, 0.7, 0, '#ffffff'),
    box(0.9, 0.3, 0.9, 0, 0.95, 0, '#ffe08a'),
    box(1.15, 0.45, 1.15, 0, 1.25, 0, '#ffffff'),
    box(1, 0.3, 1, 0, 1.7, 0, '#ffe08a'),
    box(0.6, 0.2, 0.6, 0, 2, 0, '#ffffff'),
  ),
  burner: model(box(0.12, 0.2, 0.12, 0, 0.32, 0, '#ffb347')),
  airship: model(
    box(3.6, 0.8, 0.8, 0, 0, 0, '#eef1f5'),
    box(3.62, 0.16, 0.82, 0, 0.32, 0, '#ff5d5d'),
    box(0.7, 0.56, 0.56, 2.1, 0.12, 0, '#eef1f5'),
    box(0.45, 0.32, 0.32, 2.6, 0.24, 0, '#eef1f5'),
    box(0.7, 0.56, 0.56, -2.1, 0.12, 0, '#eef1f5'),
    box(0.6, 0.9, 0.06, -2.3, -0.05, 0, '#ff5d5d'),
    box(0.6, 0.06, 0.9, -2.3, 0.37, 0, '#ff5d5d'),
    box(1.1, 0.24, 0.34, 0.3, -0.26, 0, '#3b4a5c'),
  ),
  airshipLights: model(
    box(1, 0.08, 0.36, 0.3, -0.18, 0, '#ffe9a8'),
    box(0.1, 0.1, 0.1, 2.85, 0.35, 0, '#ffffff'),
    box(0.1, 0.1, 0.1, -2.6, 0.35, 0, '#ff3b30'),
  ),
  dragonHead: model(
    box(1.2, 0.6, 0.7, 0, 0, 0, '#eef8f6'),
    box(0.7, 0.34, 0.5, 0.8, 0.04, 0, '#eef8f6'),
    box(0.5, 0.1, 0.52, 0.85, -0.02, 0, '#ffd166'),
    box(0.1, 0.4, 0.08, -0.25, 0.58, 0.2, '#58c7c0'),
    box(0.1, 0.4, 0.08, -0.25, 0.58, -0.2, '#58c7c0'),
    box(0.5, 0.04, 0.04, 1.3, 0.2, 0.34, '#58c7c0'),
    box(0.5, 0.04, 0.04, 1.3, 0.2, -0.34, '#58c7c0'),
    box(0.12, 0.12, 0.72, 0.4, 0.36, 0, '#17323a'),
  ),
  dragonEyes: model(box(0.13, 0.13, 0.74, 0.4, 0.36, 0, '#7df9ff')),
  dragonBody: model(
    box(0.8, 0.5, 0.5, 0, 0, 0, '#eef8f6'),
    box(0.8, 0.12, 0.42, 0, -0.06, 0, '#ffd166'),
    box(0.3, 0.2, 0.06, 0, 0.5, 0, '#19b5a5'),
  ),
  dragonGlow: model(box(0.5, 0.06, 0.1, 0, 0.5, 0, '#7df9ff')),
  whale: model(
    box(2.6, 0.8, 0.9, 0, 0, 0, '#3d5a80'),
    box(2.4, 0.3, 0.8, 0.1, -0.12, 0, '#dfe9f2'),
    box(0.7, 0.6, 0.7, 1.5, 0.06, 0, '#3d5a80'),
    box(0.9, 0.4, 0.4, -1.6, 0.2, 0, '#3d5a80'),
    box(0.4, 0.1, 1.4, -2.1, 0.36, 0, '#2c4460'),
    box(0.5, 0.08, 0.3, 0.3, 0.1, 0.55, '#2c4460'),
    box(0.5, 0.08, 0.3, 0.3, 0.1, -0.55, '#2c4460'),
  ),
  saucer: model(
    box(1.9, 0.16, 1.1, 0, 0, 0, '#c9d2dc'),
    box(1.1, 0.16, 1.9, 0, 0, 0, '#c9d2dc'),
    box(1.5, 0.18, 1.5, 0, 0.02, 0, '#aeb9c6'),
    box(0.7, 0.34, 0.7, 0, 0.2, 0, '#8ff0ff'),
  ),
  saucerBeam: model(
    box(0.5, 2.4, 0.5, 0, -2.4, 0, '#8dffb0'),
    box(0.9, 2.4, 0.9, 0, -4.8, 0, '#8dffb0'),
    box(1.3, 2.6, 1.3, 0, -7.4, 0, '#8dffb0'),
    box(1.95, 0.06, 1.15, 0, 0.05, 0, '#ffe66d'),
    box(1.15, 0.06, 1.95, 0, 0.05, 0, '#ffe66d'),
  ),
  rocket: model(
    box(0.5, 2.2, 0.5, 0, 0.5, 0, '#f4f6f8'),
    box(0.36, 0.4, 0.36, 0, 2.7, 0, '#ff5d5d'),
    box(0.2, 0.3, 0.2, 0, 3.1, 0, '#ff5d5d'),
    box(0.52, 0.2, 0.52, 0, 1.9, 0, '#2f3b4c'),
    box(1.1, 0.6, 0.08, 0, 0.5, 0, '#ff5d5d'),
    box(0.08, 0.6, 1.1, 0, 0.5, 0, '#ff5d5d'),
    box(0.3, 0.5, 0.3, 0, 0, 0, '#5b6675'),
  ),
  flame: model(
    box(0.34, 0.7, 0.34, 0, -0.7, 0, '#ffd166'),
    box(0.24, 0.8, 0.24, 0, -1.5, 0, '#ff8c42'),
    box(0.12, 0.6, 0.12, 0, -2.1, 0, '#ff5d5d'),
  ),
  pad: model(
    box(3.2, 0.3, 3.2, 0, -0.1, 0, '#8b95a3'),
    box(2.4, 0.06, 2.4, 0, 0.2, 0, '#ffd166'),
    box(0.2, 3.4, 0.2, 1.1, 0.2, 0, '#c2413b'),
    box(0.9, 0.1, 0.16, 0.65, 2.6, 0, '#c2413b'),
  ),
  spark: model(box(0.16, 0.16, 0.16, 0, 0, 0, '#ffffff')),
  spokes: model(
    box(8.4, 0.08, 0.1, 0, -0.04, 0, '#f4f6f8'),
    box(0.12, 1.66, 0.14, 4.2, -0.83, 0, '#ff5d8f'),
    box(0.12, 1.66, 0.14, -4.2, -0.83, 0, '#ff5d8f'),
  ),
  rimLights: model(
    box(0.14, 1.66, 0.16, 4.2, -0.83, 0, '#ffd166'),
    box(0.14, 1.66, 0.16, -4.2, -0.83, 0, '#ffd166'),
  ),
  gondola: model(
    box(0.5, 0.34, 0.3, 0, -0.5, 0, '#ffffff'),
    box(0.56, 0.06, 0.36, 0, -0.18, 0, '#ffffff'),
    box(0.04, 0.2, 0.04, 0, -0.14, 0, '#3b4a5c'),
  ),
  gondolaLights: model(box(0.4, 0.12, 0.32, 0, -0.38, 0, '#fff3c4')),
  wheelStand: model(
    box(8, 0.3, 3, 0, -0.3, 0, '#b08968'),
    slanted(0.22, 5.9, 0.22, 0.42, 1.2, 2.6, 0.45, '#f4f6f8'),
    slanted(0.22, 5.9, 0.22, -0.42, -1.2, 2.6, 0.45, '#f4f6f8'),
    slanted(0.22, 5.9, 0.22, 0.42, 1.2, 2.6, -0.45, '#f4f6f8'),
    slanted(0.22, 5.9, 0.22, -0.42, -1.2, 2.6, -0.45, '#f4f6f8'),
    box(0.5, 0.5, 1.1, 0, 4.95, 0, '#ff5d8f'),
  ),
}

const candy = ['#ff5d5d', '#ffd166', '#06d6a0', '#4cc9f0', '#b28dff', '#ff8fab', '#f4a261']

function balloons(): Fleet {
  const anchors: [x: number, z: number][] = [
    [170, 232],
    [205, 212],
    [150, 188],
    [236, 300],
    [352, 250],
    [380, 398],
    [262, 412],
    [330, 196],
    [128, 120],
  ]
  return {
    count: anchors.length,
    model: models.balloon,
    glow: models.burner,
    colors: anchors.map((_, i) => candy[i % candy.length]!),
    place: (i, seconds, out) => {
      const [x, z] = anchors[i]!
      const angle = seconds * (0.008 + 0.006 * hash(i, 2)) * (i % 2 ? 1 : -1) + i * 1.7
      const reach = 10 + 16 * hash(i, 5)
      out.x = x + reach * Math.cos(angle)
      out.z = z + reach * 0.7 * Math.sin(angle)
      out.y = 9 + 5 * hash(i, 8) + 0.7 * Math.sin(seconds * 0.35 + i)
      out.heading = seconds * 0.05 + i
      out.scale = 1.7
    },
  }
}

function airships(): Fleet {
  const [cx, cz, rx, rz] = [292, 300, 150, 170]
  return {
    count: 2,
    model: models.airship,
    glow: models.airshipLights,
    place: (i, seconds, out) => {
      const angle = seconds * 0.0045 + i * Math.PI
      out.x = cx + rx * Math.cos(angle)
      out.z = cz + rz * Math.sin(angle)
      out.y = 17 + 0.5 * Math.sin(seconds * 0.2 + i * 2)
      out.heading = Math.atan2(-rz * Math.cos(angle), -rx * Math.sin(angle))
      out.scale = 1.5
    },
  }
}

const karl = { segments: 34, gap: 0.95, speed: 6.5, height: 14, wave: 2.2 }

function dragon(): Fleet[] {
  const flight = new CatmullRomCurve3(
    [
      [171, 249],
      [134, 226],
      [118, 190],
      [140, 150],
      [118, 122],
      [160, 128],
      [205, 150],
      [236, 176],
      [228, 212],
      [200, 236],
    ].map(([x, z]) => new Vector3(x, 0, z)),
    true,
    'centripetal',
  )
  const points = flight.getSpacedPoints(400)
  const path = makePath(points.flatMap(({ x, z }) => [x, z]))
  const part =
    (segment: number): Fleet['place'] =>
    (i, seconds, out) => {
      const index = segment + i
      const at = seconds * karl.speed - index * karl.gap
      sample(path, ((at % path.length) + path.length) % path.length, out)
      const ripple = at * 0.16
      out.y = karl.height + karl.wave * Math.sin(ripple) + 1.2 * Math.sin(ripple * 0.37)
      out.pitch = Math.atan(karl.wave * 0.16 * Math.cos(ripple))
      out.x += 1.4 * Math.sin(ripple * 0.6) * Math.sin(out.heading)
      out.z += 1.4 * Math.sin(ripple * 0.6) * Math.cos(out.heading)
      out.scale = 3 * (1 - 0.72 * (index / karl.segments) ** 1.6)
    }
  return [
    { count: 1, model: models.dragonHead, glow: models.dragonEyes, place: part(0) },
    {
      count: karl.segments,
      model: models.dragonBody,
      glow: models.dragonGlow,
      place: part(1),
    },
  ]
}

function whales(): Fleet {
  const pods: [x: number, z: number, heading: number][] = [
    [150, 162, 0.6],
    [246, 126, 2.4],
    [262, 168, 4.2],
    [96, 236, 1.2],
  ]
  const [every, leap] = [38, 3.4]
  return {
    count: pods.length,
    model: models.whale,
    place: (i, seconds, out) => {
      const [x, z, heading] = pods[i]!
      const since = (seconds + i * 11) % every
      const arc = since / leap
      out.scale = arc < 1 ? 1.3 : 0
      out.heading = heading
      out.x = x + Math.cos(heading) * 5 * arc
      out.z = z - Math.sin(heading) * 5 * arc
      out.y = -1.4 + 4.4 * Math.sin(Math.PI * arc)
      out.pitch = 1.1 * Math.cos(Math.PI * arc)
    },
  }
}

function saucer(): Fleet {
  return {
    count: 1,
    model: models.saucer,
    glow: models.saucerBeam,
    place: (_, seconds, out) => {
      out.scale = dark() ? 1.4 : 0
      out.x = 134 + 3 * Math.cos(seconds * 0.13)
      out.z = 226 + 3 * Math.sin(seconds * 0.17)
      out.y = 11 + 0.4 * Math.sin(seconds * 0.9)
      out.heading = seconds * 0.6
    },
  }
}

const launch = { x: 352, z: 430, every: 150, burn: 11, thrust: 0.9, ground: 0.5 }

function rocket(): Fleet[] {
  const altitude = (seconds: number) => {
    const since = seconds % launch.every
    const flying = since < launch.burn ? launch.burn - since : since - (launch.every - launch.burn)
    return flying > 0 ? (launch.thrust * flying * flying) / 2 : 0
  }
  const stand: Fleet['place'] = (_, seconds, out) => {
    out.x = launch.x
    out.z = launch.z
    out.y = launch.ground + altitude(seconds)
    out.scale = 1.5
  }
  return [
    {
      count: 1,
      model: models.pad,
      place: (_, __, out) => Object.assign(out, { x: launch.x, z: launch.z, y: launch.ground }),
    },
    { count: 1, model: models.rocket, place: stand },
    {
      count: 1,
      model: models.flame,
      glow: models.flame,
      place: (i, seconds, out) => {
        stand(i, seconds, out)
        out.scale = altitude(seconds) > 0 ? 1.5 : 0
        out.stretch = 1 + 0.25 * Math.sin(seconds * 30)
      },
    },
  ]
}

const show = { bursts: 7, sparks: 30, every: 8, lasts: 2.6, spread: 3.4 }

function fireworks(): Fleet {
  const stages: [x: number, z: number][] = [
    [258, 172],
    [214, 150],
    [238, 150],
  ]
  const golden = Math.PI * (3 - Math.sqrt(5))
  return {
    count: show.bursts * show.sparks,
    model: models.spark,
    glow: models.spark,
    colors: Array.from(
      { length: show.bursts * show.sparks },
      (_, i) => candy[Math.floor(i / show.sparks) % candy.length]!,
    ),
    place: (i, seconds, out) => {
      const burst = Math.floor(i / show.sparks)
      const clock = seconds + burst * (show.every / show.bursts) * 2.3
      const [round, since] = [Math.floor(clock / show.every), clock % show.every]
      const [x, z] = stages[(round + burst) % stages.length]!
      const spark = i % show.sparks
      const rise = 1 - (2 * spark + 1) / show.sparks
      const around = spark * golden
      const reach = show.spread * (1 - Math.exp(-2.4 * since)) * Math.sqrt(1 - rise * rise)
      out.x = x + 8 * (hash(round, burst) - 0.5) + reach * Math.cos(around)
      out.z = z + 8 * (hash(burst, round) - 0.5) + reach * Math.sin(around)
      out.y =
        11 +
        3 * hash(round + 3, burst) +
        show.spread * (1 - Math.exp(-2.4 * since)) * rise -
        0.5 * since * since
      out.scale = dark() && since < show.lasts ? 1.6 * (1 - since / show.lasts) : 0
    },
  }
}

const wheel = { x: 222.5, z: 163.5, hub: 5.3, radius: 4.2, spokes: 8, turn: 0.1 }

function bigWheel(): Fleet[] {
  const hub = (out: { x: number; y: number; z: number }) =>
    Object.assign(out, { x: wheel.x, z: wheel.z, y: wheel.hub })
  const cars = wheel.spokes * 2
  return [
    {
      count: 1,
      model: models.wheelStand,
      place: (_, __, out) => Object.assign(hub(out), { y: 0.35 }),
    },
    {
      count: wheel.spokes,
      model: models.spokes,
      glow: models.rimLights,
      place: (i, seconds, out) => {
        hub(out)
        out.pitch = seconds * wheel.turn + (i * Math.PI) / wheel.spokes
      },
    },
    {
      count: cars,
      model: models.gondola,
      glow: models.gondolaLights,
      colors: Array.from({ length: cars }, (_, i) => candy[i % candy.length]!),
      place: (i, seconds, out) => {
        const angle = seconds * wheel.turn + (i * Math.PI * 2) / cars
        hub(out)
        out.x += wheel.radius * Math.cos(angle)
        out.y += wheel.radius * Math.sin(angle)
      },
    },
  ]
}

export function Wonders() {
  const fleets = useMemo(
    () => [
      balloons(),
      airships(),
      ...dragon(),
      whales(),
      saucer(),
      ...rocket(),
      fireworks(),
      ...bigWheel(),
    ],
    [],
  )
  return fleets.map((fleet, i) => <Vehicles key={i} fleet={fleet} />)
}
