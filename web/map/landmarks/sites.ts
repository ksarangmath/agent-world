import { mapWidth } from '../../../shared/map/grid'
import { groundAt, places, roads, spots, warp } from '../atlas'
import { heightAt, shoreHeight } from '../elevation'
import type { Point } from './shapes'

export type Site = { x: number; y: number; ground: number }

export function site(lon: number, lat: number): Site {
  const [x, y] = warp(lon, lat)
  return { x, y, ground: Math.max(heightAt(x, y), shoreHeight) }
}

export const angleBetween = (a: [number, number], b: [number, number]) => {
  const [ax, ay] = warp(...a)
  const [bx, by] = warp(...b)
  return Math.atan2(bx - ax, by - ay)
}

export const offset = (s: Site, yaw: number, along: number, across = 0, up = 0): Point => [
  s.x + Math.sin(yaw) * along + Math.cos(yaw) * across,
  s.ground + up,
  s.y + Math.cos(yaw) * along - Math.sin(yaw) * across,
]

export function xy([x, , z]: Point): [number, number] {
  return [x, z]
}

const stood = new Set(
  places.flatMap((place) => spots(place).map((spot) => spot.y * mapWidth + spot.x)),
)

function open(x: number, y: number, radius: number) {
  for (let ty = Math.floor(y - radius); ty <= Math.floor(y + radius); ty++) {
    for (let tx = Math.floor(x - radius); tx <= Math.floor(x + radius); tx++) {
      if ((tx + 0.5 - x) ** 2 + (ty + 0.5 - y) ** 2 > (radius + 0.5) ** 2) continue
      const kind = groundAt(tx, ty)
      const tile = ty * mapWidth + tx
      if (kind === 'ocean' || kind === 'water' || roads[tile] || stood.has(tile)) return false
    }
  }
  return true
}

export function clearSite(lon: number, lat: number, radius: number, reach = 4): Site {
  const [x, y] = warp(lon, lat)
  let best: [number, number] | undefined
  let nearest = Infinity
  for (let dy = -reach; dy <= reach; dy += 0.5) {
    for (let dx = -reach; dx <= reach; dx += 0.5) {
      const away = dx * dx + dy * dy
      if (away < nearest && open(x + dx, y + dy, radius)) [best, nearest] = [[x + dx, y + dy], away]
    }
  }
  const [sx, sy] = best ?? [x, y]
  return { x: sx, y: sy, ground: Math.max(heightAt(sx, sy), shoreHeight) }
}
