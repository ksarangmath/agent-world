import { mapHeight, mapWidth } from '../../shared/map/grid'
import { roadClasses, roadLines, type RoadClass } from '../../shared/map/route'
import { hash } from './elevation'
import { chains, reversed } from './lines'

export const fieldScale = 4
export const halfWidths: Record<RoadClass, number> = { local: 0.36, street: 0.4, freeway: 0.46 }
export const dashEvery = 1.4

const cornerRadius = 0.5
const cornerSteps = 5
const reach = 0.95
const junctionReach = 2
const besideRoad = 0.2
const smallestIsland = 48

export function direct(path: ArrayLike<number>): number[] {
  const line: number[] = []
  for (let i = 0; i < path.length; i += 2) {
    line.push(path[i]!, path[i + 1]!)
    for (;;) {
      const [ax, ay, bx, by, cx, cy] = line.slice(-6)
      const end = line.length
      if (end >= 4 && line[end - 2] === line[end - 4] && line[end - 1] === line[end - 3]) {
        line.length -= 2
      } else if (
        end >= 6 &&
        (bx! - ax!) * (cx! - bx!) + (by! - ay!) * (cy! - by!) <
          -0.95 * Math.hypot(bx! - ax!, by! - ay!) * Math.hypot(cx! - bx!, cy! - by!)
      ) {
        line.splice(end - 4, 2)
      } else break
    }
  }
  return line
}

export function rounded(line: ArrayLike<number>, radius = cornerRadius): number[] {
  const n = line.length / 2
  const points = [line[0]!, line[1]!]
  for (let i = 1; i < n - 1; i++) {
    const [ax, ay, bx, by, cx, cy] = [
      line[i * 2 - 2]!,
      line[i * 2 - 1]!,
      line[i * 2]!,
      line[i * 2 + 1]!,
      line[i * 2 + 2]!,
      line[i * 2 + 3]!,
    ]
    const [before, after] = [Math.hypot(bx - ax, by - ay), Math.hypot(cx - bx, cy - by)]
    const cut = Math.min(radius, before / 2, after / 2)
    const straight =
      Math.abs((bx - ax) * (cy - by) - (by - ay) * (cx - bx)) < 0.02 * before * after &&
      (bx - ax) * (cx - bx) + (by - ay) * (cy - by) > 0
    if (straight || cut < 0.05) {
      points.push(bx, by)
      continue
    }
    const [sx, sy] = [bx + ((ax - bx) / before) * cut, by + ((ay - by) / before) * cut]
    const [ex, ey] = [bx + ((cx - bx) / after) * cut, by + ((cy - by) / after) * cut]
    for (let step = 0; step <= cornerSteps; step++) {
      const t = step / cornerSteps
      const [u, v, w] = [(1 - t) * (1 - t), 2 * t * (1 - t), t * t]
      points.push(u * sx + v * bx + w * ex, u * sy + v * by + w * ey)
    }
  }
  points.push(line[n * 2 - 2]!, line[n * 2 - 1]!)
  return points
}

function nearSegment(px: number, py: number, line: number[], i: number) {
  const [ax, ay, bx, by] = [line[i]!, line[i + 1]!, line[i + 2]!, line[i + 3]!]
  const [dx, dy] = [bx - ax, by - ay]
  const span = dx * dx + dy * dy || 1
  const t = Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / span))
  const side = dx * (py - ay) - dy * (px - ax) < 0 ? -1 : 1
  return { t, distance: Math.hypot(px - ax - dx * t, py - ay - dy * t), side }
}

const edges = roadClasses.flatMap((roadClass) =>
  roadLines[roadClass].map((line) => ({ line, roadClass })),
)
const nodeOf = (x: number, y: number) => y * mapWidth + x
const meeting = new Map<number, number[]>()
edges.forEach(({ line }, i) => {
  for (const node of [nodeOf(line[0]!, line[1]!), nodeOf(line.at(-2)!, line.at(-1)!)]) {
    meeting.set(node, [...(meeting.get(node) ?? []), i])
  }
})
const towards = (line: number[], i: number) => {
  const [dx, dy] = [line[i + 2]! - line[i]!, line[i + 3]! - line[i + 1]!]
  const length = Math.hypot(dx, dy) || 1
  return [dx / length, dy / length] as const
}
const sharpestTurn = -0.3

export const roadEdges: readonly { line: number[]; roadClass: RoadClass }[] = edges

export function journey(start: number, seed: number, tiles: number): number[] {
  const points: number[] = []
  const taken = new Set([start])
  let line = hash(seed, 3) < 0.5 ? edges[start]!.line : reversed(edges[start]!.line)
  let travelled = 0
  for (;;) {
    for (let i = points.length ? 2 : 0; i < line.length; i++) points.push(line[i]!)
    for (let i = 0; i + 3 < line.length; i += 2) {
      travelled += Math.hypot(line[i + 2]! - line[i]!, line[i + 3]! - line[i + 1]!)
    }
    if (travelled > tiles) break
    const node = nodeOf(line.at(-2)!, line.at(-1)!)
    const [hx, hy] = towards(line, line.length - 4)
    const onward = (meeting.get(node) ?? []).flatMap((i) => {
      if (taken.has(i)) return []
      const next = edges[i]!.line
      const leaving = nodeOf(next[0]!, next[1]!) === node ? next : reversed(next)
      const [nx, ny] = towards(leaving, 0)
      return hx * nx + hy * ny > sharpestTurn ? [{ i, leaving }] : []
    })
    if (!onward.length) break
    const pick = onward[Math.floor(hash(seed, points.length) * onward.length)]!
    taken.add(pick.i)
    line = pick.leaving
  }
  return rounded(direct(points))
}

function junctions(): number[] {
  const lines = roadClasses.flatMap((roadClass) => roadLines[roadClass])
  const key = (x: number, y: number) => y * mapWidth + x
  const degree = new Map<number, number>()
  for (const line of lines) {
    const last = line.length - 2
    for (let i = 0; i <= last; i += 2) {
      const k = key(line[i]!, line[i + 1]!)
      degree.set(k, (degree.get(k) ?? 0) + (i === 0 || i === last ? 1 : 2))
    }
  }
  const onFreeway = new Set<number>()
  for (const line of roadLines.freeway) {
    for (let i = 0; i < line.length; i += 2) onFreeway.add(key(line[i]!, line[i + 1]!))
  }
  const nodes: number[] = []
  for (const [k, count] of degree)
    if (count >= 3 && !onFreeway.has(k)) nodes.push(k % mapWidth, Math.floor(k / mapWidth))
  for (const line of lines) {
    for (const end of [0, line.length - 2]) {
      const [x, y] = [line[end]!, line[end + 1]!]
      if (degree.get(key(x, y)) !== 1) continue
      const meets = lines.some((other) => {
        if (other === line) return false
        for (let i = 0; i + 3 < other.length; i += 2) {
          if (nearSegment(x, y, other, i).distance < 0.75) return true
        }
        return false
      })
      if (meets && !onFreeway.has(key(x, y))) nodes.push(x, y)
    }
  }
  return nodes
}

export function roadField(): { data: Uint8Array; width: number; height: number } {
  const [width, height] = [mapWidth * fieldScale, mapHeight * fieldScale]
  const data = new Uint8Array(width * height * 4).fill(255)
  const freeway = new Uint8Array(width * height)
  const first = new Uint16Array(width * height)
  const shared = new Uint8Array(width * height)
  let road = 0
  for (const roadClass of roadClasses) {
    const half = halfWidths[roadClass]
    for (const chain of chains(roadLines[roadClass])) {
      road++
      const line = rounded(chain).map((value) => value + 0.5)
      let travelled = 0
      for (let i = 0; i + 3 < line.length; i += 2) {
        const [ax, ay, bx, by] = [line[i]!, line[i + 1]!, line[i + 2]!, line[i + 3]!]
        const length = Math.hypot(bx - ax, by - ay)
        const [left, right] = [
          Math.max(0, Math.floor((Math.min(ax, bx) - reach) * fieldScale)),
          Math.min(width - 1, Math.ceil((Math.max(ax, bx) + reach) * fieldScale)),
        ]
        const [top, bottom] = [
          Math.max(0, Math.floor((Math.min(ay, by) - reach) * fieldScale)),
          Math.min(height - 1, Math.ceil((Math.max(ay, by) + reach) * fieldScale)),
        ]
        for (let row = top; row <= bottom; row++) {
          for (let column = left; column <= right; column++) {
            const near = nearSegment((column + 0.5) / fieldScale, (row + 0.5) / fieldScale, line, i)
            const edge = Math.round(Math.min(1, Math.max(0, near.distance - half + 0.5)) * 255)
            const texel = (row * width + column) * 4
            if (near.distance <= half + besideRoad) {
              if (first[texel / 4] === 0) first[texel / 4] = road
              else if (first[texel / 4] !== road) shared[texel / 4] = 1
            }
            const over = roadClass === 'freeway' && near.distance <= half
            if (edge >= data[texel + 1]! && !(over && !freeway[texel / 4])) continue
            if (over) freeway[texel / 4] = 1
            const wave = Math.cos(((travelled + near.t * length) / dashEvery) * Math.PI * 2)
            data[texel] = Math.round((0.5 + (near.side * Math.min(1, near.distance)) / 2) * 255)
            data[texel + 1] = edge
            data[texel + 3] = Math.round(127.5 + 127.5 * wave)
          }
        }
        travelled += length
      }
    }
  }
  const paved = Math.round(0.5 * 255) - 1
  shared.forEach((between, texel) => {
    if (!between) return
    data[texel * 4 + 1] = Math.min(data[texel * 4 + 1]!, paved)
    data[texel * 4 + 3] = 0
  })
  const asphalt = (texel: number) => data[texel * 4 + 1]! <= paved
  const [unseen, island, open] = [0, 1, 2]
  const state = new Uint8Array(width * height)
  for (let start = 0; start < state.length; start++) {
    if (state[start] !== unseen || asphalt(start) || data[start * 4 + 1] === 255) continue
    const texels = [start]
    state[start] = island
    let enclosed = true
    for (let n = 0; n < texels.length && enclosed; n++) {
      const texel = texels[n]!
      const column = texel % width
      for (const next of [texel - width, texel + width, texel - 1, texel + 1]) {
        const wraps =
          (next === texel - 1 && column === 0) || (next === texel + 1 && column === width - 1)
        if (next < 0 || next >= state.length || wraps) continue
        if (asphalt(next) || state[next] === island) continue
        if (state[next] === open || data[next * 4 + 1] === 255 || texels.length >= smallestIsland) {
          enclosed = false
          break
        }
        state[next] = island
        texels.push(next)
      }
    }
    for (const texel of texels) {
      if (!enclosed) {
        state[texel] = open
        continue
      }
      data[texel * 4 + 1] = paved
      data[texel * 4 + 3] = 0
    }
  }
  const nodes = junctions()
  const span = junctionReach * fieldScale
  for (let n = 0; n < nodes.length; n += 2) {
    const [x, y] = [nodes[n]! + 0.5, nodes[n + 1]! + 0.5]
    const [column0, row0] = [Math.floor(x * fieldScale), Math.floor(y * fieldScale)]
    for (let row = Math.max(0, row0 - span); row <= Math.min(height - 1, row0 + span); row++) {
      for (
        let column = Math.max(0, column0 - span);
        column <= Math.min(width - 1, column0 + span);
        column++
      ) {
        const distance = Math.hypot((column + 0.5) / fieldScale - x, (row + 0.5) / fieldScale - y)
        const texel = (row * width + column) * 4 + 2
        if (freeway[(texel - 2) / 4]) continue
        data[texel] = Math.min(
          data[texel]!,
          Math.round(Math.min(1, distance / junctionReach) * 255),
        )
      }
    }
  }
  return { data, width, height }
}
