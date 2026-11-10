import { describe, expect, test } from 'vitest'
import geography from '../../../shared/map/geography.json'
import { roadClasses } from '../../../shared/map/route'
import { decks, routes, slabs, surfaceAt } from '../decks'
import { heightAt, shoreHeight } from '../elevation'
import { chains } from '../lines'
import { wetAt } from './bridges'

const laneOffset = 0.22
const tileCenter = 0.5
const stride = 0.05
const tallestStep = 0.15
const joined = 0.1

function drawnUnder(x: number, y: number) {
  let [height, nearest] = [Number.NaN, Infinity]
  for (const { from, to } of slabs) {
    const [dx, dy] = [to[0] - from[0], to[2] - from[2]]
    const t = Math.max(
      0,
      Math.min(1, ((x - from[0]) * dx + (y - from[2]) * dy) / (dx * dx + dy * dy)),
    )
    const away = Math.sqrt((x - from[0] - t * dx) ** 2 + (y - from[2] - t * dy) ** 2)
    if (away < nearest) [height, nearest] = [from[1] + t * (to[1] - from[1]), away]
  }
  return { height, away: nearest }
}

describe.each(['goldenGate', 'bayWest', 'bayEast'] as const)('%s', (span) => {
  const route = routes[span]
  test('meets dry ground at both ends', () => {
    for (const s of [0, route.length]) {
      const end = route.at(s)
      expect(wetAt(end.x, end.y)).toBe(false)
      expect(end.deck).toBeCloseTo(Math.max(heightAt(end.x, end.y), shoreHeight), 5)
      expect(surfaceAt(end.x, end.y)).toBeCloseTo(end.deck, 5)
    }
  })

  test('carries both traffic lanes on the drawn deck', () => {
    const road = decks.filter((deck) => deck.span === span)
    expect(road.length).toBeGreaterThan(20)
    for (const piece of road) {
      for (const offset of [-laneOffset, laneOffset]) {
        const [x, y] = [
          piece.x + Math.cos(piece.angle) * offset,
          piece.y - Math.sin(piece.angle) * offset,
        ]
        const under = drawnUnder(x, y)
        expect(under.away).toBeLessThan(route.width / 2)
        expect(Math.abs(surfaceAt(x, y) - under.height)).toBeLessThan(joined)
      }
    }
  })
})

test('never drops or lifts traffic on any road', () => {
  let driven = 0
  for (const roadClass of roadClasses) {
    for (const line of chains(geography.roads[roadClass])) {
      for (const offset of [-laneOffset, laneOffset]) {
        for (let p = 0; p + 3 < line.length; p += 2) {
          const [x0, y0, x1, y1] = [line[p]!, line[p + 1]!, line[p + 2]!, line[p + 3]!].map(
            (value) => value + tileCenter,
          ) as [number, number, number, number]
          const length = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2)
          const [alongX, alongY] = [(x1 - x0) / length, (y1 - y0) / length]
          let before: number | undefined
          for (let d = 0; d < length; d += stride) {
            const height = surfaceAt(
              x0 + alongX * d + alongY * offset,
              y0 + alongY * d - alongX * offset,
            )
            if (before !== undefined) {
              driven++
              if (Math.abs(height - before) >= tallestStep) expect(height).toBeCloseTo(before, 1)
            }
            before = height
          }
        }
      }
    }
  }
  expect(driven).toBeGreaterThan(500_000)
})
