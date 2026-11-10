import { mapHeight, mapWidth, warp } from '../../shared/map/grid'
import { heightAt, shoreDistance, shoreHeight } from './elevation'
import { axes, deckPieces, shores, wetAt, type Major, type Span } from './landmarks/bridges'

const strayed = 1
const fade = 0.3
const sampleStep = 0.25
const farthestShore = 6

const landings = shores.map((shore) => ({
  ...shore,
  ground: Math.max(heightAt(shore.x, shore.y), shoreHeight),
}))

const landingNear = (x: number, y: number) =>
  landings.reduce((best, landing) =>
    (landing.x - x) ** 2 + (landing.y - y) ** 2 < (best.x - x) ** 2 + (best.y - y) ** 2
      ? landing
      : best,
  )

function level({ cap, slope }: { cap: number; slope: number }, x: number, y: number) {
  const landing = landingNear(x, y)
  return Math.min(
    cap,
    landing.ground + slope * Math.sqrt((x - landing.x) ** 2 + (y - landing.y) ** 2),
  )
}

export const decks = deckPieces.map((deck) => ({ ...deck, height: level(deck, deck.x, deck.y) }))

function routeOf(span: Major) {
  const pieces = deckPieces.filter((deck) => deck.span === span)
  const profile = pieces[0]!
  const axis = axes[span].map(([lon, lat]) => warp(lon, lat))
  const alongAxis = (x: number, y: number) => {
    let [along, away, walked] = [0, Infinity, 0]
    for (let i = 0; i + 1 < axis.length; i++) {
      const [[ax, ay], [bx, by]] = [axis[i]!, axis[i + 1]!]
      const length = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2)
      const t = ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / length ** 2
      const within = Math.max(0, Math.min(1, t))
      const distance = (x - ax - within * (bx - ax)) ** 2 + (y - ay - within * (by - ay)) ** 2
      if (distance < away) [along, away] = [walked + t * length, distance]
      walked += length
    }
    return along
  }
  const stations = new Map<number, { x: number; y: number; count: number }>()
  for (const piece of pieces) {
    const station = Math.round(alongAxis(piece.x, piece.y))
    const held = stations.get(station) ?? { x: 0, y: 0, count: 0 }
    stations.set(station, { x: held.x + piece.x, y: held.y + piece.y, count: held.count + 1 })
  }
  const order = [...stations.keys()].sort((a, b) => a - b)
  const centerline = order.map((station): [number, number] => {
    const window = [station - 1, station, station + 1].flatMap((k) => stations.get(k) ?? [])
    const count = window.reduce((sum, held) => sum + held.count, 0)
    return [
      window.reduce((sum, held) => sum + held.x, 0) / count,
      window.reduce((sum, held) => sum + held.y, 0) / count,
    ]
  })
  const landing = (station: number): [number, number] => {
    const reached = pieces
      .filter((piece) => Math.round(alongAxis(piece.x, piece.y)) === station)
      .map((piece) => landingNear(piece.x, piece.y))
    return [
      reached.reduce((sum, shore) => sum + shore.x, 0) / reached.length,
      reached.reduce((sum, shore) => sum + shore.y, 0) / reached.length,
    ]
  }
  const ashore = ([fromX, fromY]: [number, number], [x, y]: [number, number]) => {
    const reach = Math.sqrt((x - fromX) ** 2 + (y - fromY) ** 2)
    const [dx, dy] = [(x - fromX) / reach, (y - fromY) / reach]
    let out = 0
    while (out < farthestShore && wetAt(x + dx * out, y + dy * out)) out += sampleStep
    return [x + dx * out, y + dy * out] as [number, number]
  }
  const points = [
    ashore(centerline[0]!, landing(order[0]!)),
    ...centerline,
    ashore(centerline.at(-1)!, landing(order.at(-1)!)),
  ].filter(
    ([x, y], i, all) =>
      i === 0 || (x - all[i - 1]![0]) ** 2 + (y - all[i - 1]![1]) ** 2 > sampleStep ** 2,
  )
  const distances = [0]
  points.slice(1).forEach(([x, y], i) => {
    const [px, py] = points[i]!
    distances.push(distances[i]! + Math.sqrt((x - px) ** 2 + (y - py) ** 2))
  })
  const length = distances.at(-1)!
  const [start, finish] = [points[0]!, points.at(-1)!].map(([x, y]) =>
    Math.max(heightAt(x, y), shoreHeight),
  ) as [number, number]
  const at = (s: number) => {
    const target = Math.max(0, Math.min(length, s))
    let i = 0
    while (i < points.length - 2 && distances[i + 1]! < target) i++
    const [[px, py], [qx, qy]] = [points[i]!, points[i + 1]!]
    const segment = distances[i + 1]! - distances[i]!
    const t = (target - distances[i]!) / segment
    const [x, y] = [px + (qx - px) * t, py + (qy - py) * t]
    return {
      x,
      y,
      deck: Math.min(
        profile.cap,
        start + profile.slope * target,
        finish + profile.slope * (length - target),
      ),
      across: { x: (qy - py) / segment, y: -(qx - px) / segment },
      yaw: Math.atan2(qx - px, qy - py),
    }
  }
  return { length, width: profile.width, at }
}

export type Route = ReturnType<typeof routeOf>

export const routes: Record<Major, Route> = {
  goldenGate: routeOf('goldenGate'),
  bayWest: routeOf('bayWest'),
  bayEast: routeOf('bayEast'),
}

type Point = readonly [x: number, height: number, y: number]
export type Slab = { span: Span; from: Point; to: Point; width: number }

function pieceSlab(deck: (typeof deckPieces)[number]): Slab {
  const [alongX, alongY] = [
    (Math.sin(deck.angle) * deck.length) / 2,
    (Math.cos(deck.angle) * deck.length) / 2,
  ]
  const end = (sign: number): Point => {
    const [x, y] = [deck.x + sign * alongX, deck.y + sign * alongY]
    return [x, level(deck, x, y), y]
  }
  return { span: deck.span, from: end(-1), to: end(1), width: deck.width }
}

function routeSlabs(span: Major): Slab[] {
  const route = routes[span]
  const stops = [...Array.from({ length: Math.ceil(route.length) }, (_, s) => s), route.length]
  return stops.slice(1).map((stop, i) => {
    const [from, to] = [route.at(stops[i]!), route.at(stop)]
    return {
      span,
      from: [from.x, from.deck, from.y],
      to: [to.x, to.deck, to.y],
      width: route.width,
    }
  })
}

export const slabs: Slab[] = [
  ...deckPieces.filter((deck) => deck.span === 'generic').map(pieceSlab),
  ...(Object.keys(routes) as Major[]).flatMap(routeSlabs),
]

const slabsByTile = new Map<number, Slab[]>()
for (const slab of slabs) {
  const reach = slab.width / 2 + strayed + fade
  const [[ax, , ay], [bx, , by]] = [slab.from, slab.to]
  for (let ty = Math.floor(Math.min(ay, by) - reach); ty <= Math.max(ay, by) + reach; ty++) {
    for (let tx = Math.floor(Math.min(ax, bx) - reach); tx <= Math.max(ax, bx) + reach; tx++) {
      if (tx < 0 || ty < 0 || tx >= mapWidth || ty >= mapHeight) continue
      const tile = ty * mapWidth + tx
      const held = slabsByTile.get(tile)
      if (held) held.push(slab)
      else slabsByTile.set(tile, [slab])
    }
  }
}

const spanIndex: Record<Span, number> = { generic: 0, goldenGate: 1, bayWest: 2, bayEast: 3 }
const blend = 0.3
const crowded = Math.max(...[...slabsByTile.values()].map((held) => held.length))
const closest = new Float32Array(4)
const reaches = new Float32Array(4)
const aways = new Float32Array(crowded)
const heights = new Float32Array(crowded)
const owners = new Uint8Array(crowded)

function wetness(x: number, y: number) {
  const [gx, gy] = [x - 0.5, y - 0.5]
  const [tx, ty] = [Math.floor(gx), Math.floor(gy)]
  const [fx, fy] = [gx - tx, gy - ty]
  const at = (column: number, row: number) =>
    Math.min(
      1,
      shoreDistance[
        Math.max(0, Math.min(mapHeight - 1, row)) * mapWidth +
          Math.max(0, Math.min(mapWidth - 1, column))
      ]!,
    )
  const top = at(tx, ty) + (at(tx + 1, ty) - at(tx, ty)) * fx
  const bottom = at(tx, ty + 1) + (at(tx + 1, ty + 1) - at(tx, ty + 1)) * fx
  return top + (bottom - top) * fy
}

export function surfaceAt(x: number, y: number) {
  const ground = Math.max(heightAt(x, y), shoreHeight)
  const [tx, ty] = [Math.floor(x), Math.floor(y)]
  if (tx < 0 || ty < 0 || tx >= mapWidth || ty >= mapHeight) return ground
  const held = slabsByTile.get(ty * mapWidth + tx)
  if (!held) return ground
  const stray = strayed * wetness(x, y)
  closest.fill(Infinity)
  let count = 0
  for (const slab of held) {
    const [[ax, ah, ay], [bx, bh, by]] = [slab.from, slab.to]
    const [dx, dy] = [bx - ax, by - ay]
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
    const away = Math.sqrt((x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2)
    const owner = spanIndex[slab.span]
    aways[count] = away
    heights[count] = ah + t * (bh - ah)
    owners[count] = owner
    if (away < closest[owner]!) {
      closest[owner] = away
      reaches[owner] = slab.width / 2 + stray
    }
    count++
  }
  const owner = closest.indexOf(Math.min(...closest))
  const cover = Math.min(1, 1 - (closest[owner]! - reaches[owner]!) / fade)
  if (!(cover > 0)) return ground
  let [weight, sum] = [0, 0]
  for (let i = 0; i < count; i++) {
    if (owners[i] !== owner) continue
    const share = Math.max(0, 1 - (aways[i]! - closest[owner]!) / blend)
    weight += share
    sum += share * heights[i]!
  }
  return ground + Math.max(0, sum / weight - ground) * cover
}
