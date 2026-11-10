import { decks, routes, slabs, type Route, type Slab } from '../decks'
import type { Major, Span } from './bridges'
import { beam, reserve, solid, type Light, type Part, type Point } from './shapes'

const seabed = -1.2
const deckThickness = 0.25
const trussDepth = 0.4
const truss = '#9e2b23'
const clearing = 2

const colors: Record<Span, string> = {
  goldenGate: '#c0362c',
  bayWest: '#9aa1a7',
  bayEast: '#d8dad8',
  generic: '#a29f99',
}

type Path = Route

const side = (p: ReturnType<Path['at']>, offset: number, height: number): Point => [
  p.x + p.across.x * offset,
  height,
  p.y + p.across.y * offset,
]

function tower(
  parts: Part[],
  lights: Light[],
  p: ReturnType<Path['at']>,
  top: number,
  spread: number,
  color: string,
  beams: number[],
) {
  for (const offset of [-spread, spread]) {
    parts.push(beam(color, side(p, offset, seabed), side(p, offset * 0.85, top), 0.42))
  }
  for (const height of beams) {
    const lean = spread * (1 - 0.15 * ((height - seabed) / (top - seabed)))
    parts.push(beam(color, side(p, -lean, height), side(p, lean, height), 0.3))
  }
  lights.push({ position: side(p, -spread * 0.85, top + 0.15), color: '#ff3b2f', blink: 1 })
  lights.push({ position: side(p, spread * 0.85, top + 0.15), color: '#ff3b2f', blink: 1 })
}

function cable(
  parts: Part[],
  color: string,
  route: Path,
  offset: number,
  height: (s: number) => number,
  from: number,
  to: number,
) {
  for (let s = from; s < to; s += 0.75) {
    const next = Math.min(to, s + 0.75)
    parts.push(
      beam(
        color,
        side(route.at(s), offset, height(s)),
        side(route.at(next), offset, height(next)),
        0.11,
      ),
    )
  }
}

function suspenders(
  parts: Part[],
  lights: Light[],
  color: string,
  route: Path,
  spread: number,
  height: (s: number) => number,
  from: number,
  to: number,
  glow?: string,
) {
  for (let s = Math.ceil(from); s < to; s += 1) {
    const point = route.at(s)
    const top = height(s)
    if (top - point.deck < 0.3) continue
    for (const offset of [-spread, spread]) {
      parts.push(beam(color, side(point, offset, point.deck), side(point, offset, top), 0.07))
      if (glow) {
        for (const level of [0.25, 0.55, 0.85]) {
          lights.push({
            position: side(point, offset, point.deck + (top - point.deck) * level),
            color: glow,
            shimmer: s,
          })
        }
      }
    }
  }
}

const parabola = (from: number, to: number, high: number, low: number) => (s: number) => {
  const t = (s - (from + to) / 2) / ((to - from) / 2)
  return low + (high - low) * t * t
}

const linear = (s0: number, h0: number, s1: number, h1: number) => (s: number) =>
  h0 + ((h1 - h0) * (s - s0)) / (s1 - s0)

function roadway(parts: Part[], lights: Light[], reserved: Set<number>, span: Major, route: Path) {
  for (const s of [0, route.length]) {
    const shore = route.at(s)
    reserve(reserved, shore.x, shore.y, clearing)
  }
  for (let s = 0; s < route.length; s += 1) {
    const point = route.at(s + 0.5)
    if (s % 2 === 0) {
      for (const offset of [-route.width * 0.45, route.width * 0.45])
        lights.push({ position: side(point, offset, point.deck + 0.25), color: '#ffd98a' })
    }
    if (span === 'bayEast' && s % 3 === 1 && s > route.length * 0.42) {
      parts.push(
        solid(
          'box',
          '#b9bab6',
          [point.x, seabed, point.y],
          [0.45, point.deck - deckThickness - seabed, 0.45],
          point.yaw,
        ),
      )
    }
  }
}

const plank = (color: string, slab: Slab, below: number, thickness: number, width: number) =>
  beam(
    color,
    [slab.from[0], slab.from[1] - below - thickness / 2, slab.from[2]],
    [slab.to[0], slab.to[1] - below - thickness / 2, slab.to[2]],
    thickness,
    width,
  )

function goldenGate(parts: Part[], lights: Light[], reserved: Set<number>) {
  const route = routes.goldenGate
  roadway(parts, lights, reserved, 'goldenGate', route)
  const color = colors.goldenGate
  const [south, north] = [route.length * 0.22, route.length * 0.78]
  const deck = route.at(route.length / 2).deck
  const top = 16
  for (const s of [south, north])
    tower(parts, lights, route.at(s), top, 1, color, [deck - 0.7, 8, 11, 13.8, top - 0.2])
  for (const s of [0.5, route.length - 0.5]) {
    const shore = route.at(s)
    parts.push(
      solid(
        'box',
        '#b9b6ae',
        [shore.x, seabed, shore.y],
        [2, shore.deck - deckThickness - seabed, 1.5],
        shore.yaw,
      ),
    )
  }
  const height = (s: number) =>
    s < south
      ? linear(0, route.at(0).deck + 0.4, south, top)(s)
      : s > north
        ? linear(north, top, route.length, route.at(route.length).deck + 0.4)(s)
        : parabola(south, north, top, deck + 0.7)(s)
  for (const offset of [-0.85, 0.85]) cable(parts, color, route, offset, height, 0, route.length)
  suspenders(parts, lights, color, route, 0.85, height, 0, route.length)
}

function bayWest(parts: Part[], lights: Light[], reserved: Set<number>) {
  const route = routes.bayWest
  roadway(parts, lights, reserved, 'bayWest', route)
  const color = colors.bayWest
  const towers = [0.12, 0.36, 0.64, 0.88].map((f) => f * route.length)
  const center = route.length / 2
  const deck = route.at(center).deck
  const top = deck + 7.5
  for (const s of towers)
    tower(parts, lights, route.at(s), top, 0.85, color, [
      deck - 0.5,
      deck + 2.2,
      deck + 4.4,
      top - 0.2,
    ])
  const anchorage = route.at(center)
  parts.push(
    solid(
      'box',
      '#b9b6ae',
      [anchorage.x, seabed, anchorage.y],
      [2.2, deck + 1.6 - seabed, 1.8],
      anchorage.yaw,
    ),
  )
  const [t1, t2, t3, t4] = towers as [number, number, number, number]
  const height = (s: number) =>
    s < t1
      ? linear(0, route.at(0).deck + 0.3, t1, top)(s)
      : s < t2
        ? parabola(t1, t2, top, deck + 0.6)(s)
        : s < center
          ? linear(t2, top, center, deck + 1.6)(s)
          : s < t3
            ? linear(center, deck + 1.6, t3, top)(s)
            : s < t4
              ? parabola(t3, t4, top, deck + 0.6)(s)
              : linear(t4, top, route.length, route.at(route.length).deck + 0.3)(s)
  for (const offset of [-0.75, 0.75]) cable(parts, color, route, offset, height, 0, route.length)
  suspenders(parts, lights, color, route, 0.75, height, 0, route.length, '#f4f7ff')
}

function bayEast(parts: Part[], lights: Light[], reserved: Set<number>) {
  const route = routes.bayEast
  roadway(parts, lights, reserved, 'bayEast', route)
  const color = colors.bayEast
  const s = route.length * 0.2
  const point = route.at(s)
  const top = point.deck + 7
  parts.push(solid('box', color, [point.x, seabed, point.y], [0.9, top - seabed, 0.7], point.yaw))
  parts.push(solid('pyramid', color, [point.x, top, point.y], [0.9, 0.8, 0.7], point.yaw))
  lights.push({ position: [point.x, top + 0.9, point.y], color: '#ff3b2f', blink: 1 })
  const [from, to] = [route.length * 0.04, route.length * 0.42]
  const height = (t: number) =>
    t < s
      ? linear(from, route.at(from).deck + 0.2, s, top - 0.4)(t)
      : linear(s, top - 0.4, to, route.at(to).deck + 0.2)(t)
  for (const offset of [-0.6, 0.6]) cable(parts, color, route, offset, height, from, to)
  suspenders(parts, lights, color, route, 0.6, height, from, to)
}

export function bridges() {
  const parts: Part[] = []
  const lights: Light[] = []
  const reserved = new Set<number>()
  for (const slab of slabs) {
    parts.push(plank(colors[slab.span], slab, 0, deckThickness, slab.width))
    if (slab.span === 'goldenGate') {
      parts.push(plank(truss, slab, deckThickness, trussDepth, slab.width * 0.9))
    }
  }
  for (const deck of decks) {
    if (deck.span !== 'generic') continue
    if (deck.order % 3 === 1) {
      parts.push(
        solid(
          'box',
          '#8a8782',
          [deck.x, seabed, deck.y],
          [0.3, deck.height - deckThickness - seabed, 0.3],
          deck.angle,
        ),
      )
    }
    if (deck.order % 2 === 0) {
      const offset = (deck.order % 4 === 0 ? 1 : -1) * deck.width * 0.45
      lights.push({
        position: [
          deck.x + Math.cos(deck.angle) * offset,
          deck.height + 0.25,
          deck.y - Math.sin(deck.angle) * offset,
        ],
        color: '#ffd98a',
      })
    }
  }
  goldenGate(parts, lights, reserved)
  bayWest(parts, lights, reserved)
  bayEast(parts, lights, reserved)
  return { parts, lights, reserved }
}
