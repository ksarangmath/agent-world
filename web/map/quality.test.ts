import { expect, test } from 'vitest'
import { fresh, levels, sample, type Pace } from './quality'

const second = 1000

function run(pace: Pace, slow: boolean, from: number, seconds: number) {
  for (let i = 0; i < seconds; i++) sample(pace, slow, from + i * second)
  return from + seconds * second
}

test('three slow seconds in a row drop one level, down to the last', () => {
  const pace = fresh()
  sample(pace, true, 0)
  sample(pace, true, second)
  sample(pace, false, 2 * second)
  sample(pace, true, 3 * second)
  sample(pace, true, 4 * second)
  expect(pace.level).toBe(0)
  expect(sample(pace, true, 5 * second)).toBe(true)
  expect(pace.level).toBe(1)
  run(pace, true, 6 * second, 60)
  expect(pace.level).toBe(levels.length - 1)
})

test('quality climbs back once the machine is fast again', () => {
  const pace = fresh()
  let now = run(pace, true, 0, 6)
  expect(pace.level).toBe(2)
  now = run(pace, false, now, 20)
  expect(pace.level).toBe(2)
  run(pace, false, now, 20)
  expect(pace.level).toBe(0)
})

test('a level the machine cannot hold is retried less and less often', () => {
  const pace = fresh()
  let now = run(pace, true, 0, 3)
  const waits: number[] = []
  for (let attempt = 0; attempt < 7; attempt++) {
    const dropped = now
    while (pace.level === 1) now = run(pace, false, now, 1)
    waits.push(Math.round((now - dropped) / second / 10) * 10)
    now = run(pace, true, now, 3)
    expect(pace.level).toBe(1)
  }
  expect(waits).toEqual([30, 60, 120, 240, 480, 480, 480])
})

test('a slowdown long after a recovery waits only the first delay again', () => {
  const pace = fresh()
  let now = run(pace, true, 0, 3)
  for (let attempt = 0; attempt < 4; attempt++) {
    while (pace.level === 1) now = run(pace, false, now, 1)
    now = run(pace, true, now, 3)
  }
  while (pace.level === 1) now = run(pace, false, now, 1)
  now = run(pace, false, now, 3600)
  expect(pace.level).toBe(0)
  const dropped = run(pace, true, now, 3)
  expect(pace.level).toBe(1)
  now = dropped
  while (pace.level === 1) now = run(pace, false, now, 1)
  expect(now - dropped).toBeLessThanOrEqual(31 * second)
})
