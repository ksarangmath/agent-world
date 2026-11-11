import { expect, test } from 'vitest'
import { direct, fieldScale, halfWidths, journey, roadEdges, roadField, rounded } from './roads'

test('a rounded corner keeps both ends and stays inside the corner tile', () => {
  const line = rounded([0, 0, 10, 0, 10, 10])
  expect(line.slice(0, 2)).toEqual([0, 0])
  expect(line.slice(-2)).toEqual([10, 10])
  let corner = false
  for (let i = 0; i < line.length; i += 2) {
    const [x, y] = [line[i]!, line[i + 1]!]
    expect(Math.abs(y) < 1e-9 || Math.abs(x - 10) < 1e-9 || Math.hypot(x - 10, y) < 0.75).toBe(true)
    corner ||= x === 10 && y === 0
  }
  expect(corner).toBe(false)
  expect(line.length).toBeGreaterThan(6)
})

test('a straight run is left alone', () => {
  expect(rounded([0, 0, 5, 0, 9, 0])).toEqual([0, 0, 5, 0, 9, 0])
})

test('a road that goes out and straight back loses the spike', () => {
  expect(direct([0, 0, 5, 0, 5, 0, 8, 0, 5, 0, 5, 6])).toEqual([0, 0, 5, 0, 5, 6])
})

test('the road field has asphalt along a road and none far from one', () => {
  const { data, width, height } = roadField()
  const edges = (x: number, y: number) =>
    data[(Math.floor(y * fieldScale) * width + Math.floor(x * fieldScale)) * 4 + 1]! / 255 - 0.5
  let [onRoad, widest] = [0, 0]
  for (let i = 1; i < data.length; i += 4) {
    if (data[i]! < 127) onRoad++
    widest = Math.max(widest, 0.5 - data[i]! / 255)
  }
  expect(width * height * 4).toBe(data.length)
  expect(onRoad / (width * height)).toBeGreaterThan(0.02)
  expect(onRoad / (width * height)).toBeLessThan(0.25)
  expect(widest).toBeLessThanOrEqual(halfWidths.freeway + 0.01)
  expect(edges(1, 1)).toBeCloseTo(0.5, 1)
})

test('center lines survive the texture filter', () => {
  const { data, width } = roadField()
  const texel = (column: number, row: number, channel: number) =>
    data[(row * width + column) * 4 + channel]! / 255
  const filtered = (x: number, y: number, channel: number) => {
    const [u, v] = [x * fieldScale - 0.5, y * fieldScale - 0.5]
    const [column, row] = [Math.floor(u), Math.floor(v)]
    const [fx, fy] = [u - column, v - row]
    return (
      texel(column, row, channel) * (1 - fx) * (1 - fy) +
      texel(column + 1, row, channel) * fx * (1 - fy) +
      texel(column, row + 1, channel) * (1 - fx) * fy +
      texel(column + 1, row + 1, channel) * fx * fy
    )
  }
  let [open, centered] = [0, 0]
  for (const { line } of roadEdges) {
    for (let i = 0; i + 3 < line.length; i += 2) {
      const [x, y] = [(line[i]! + line[i + 2]!) / 2 + 0.5, (line[i + 1]! + line[i + 3]!) / 2 + 0.5]
      if (x < 2 || y < 2 || filtered(x, y, 2) < 0.6) continue
      open++
      if (Math.abs(filtered(x, y, 0) * 2 - 1) < 0.045) centered++
    }
  }
  expect(open).toBeGreaterThan(200)
  expect(centered / open).toBeGreaterThan(0.8)
})

test('a journey never doubles back on itself', () => {
  for (let start = 0; start < roadEdges.length; start += 7) {
    const line = journey(start, start * 131, 150)
    for (let i = 0; i + 5 < line.length; i += 2) {
      const [ax, ay] = [line[i + 2]! - line[i]!, line[i + 3]! - line[i + 1]!]
      const [bx, by] = [line[i + 4]! - line[i + 2]!, line[i + 5]! - line[i + 3]!]
      const lengths = Math.hypot(ax, ay) * Math.hypot(bx, by)
      if (lengths > 0) expect((ax * bx + ay * by) / lengths).toBeGreaterThan(-0.5)
    }
  }
})
