import { expect, test } from 'vitest'
import { byDay, dayLabel } from './days'

const at = (year: number, month: number, day: number, hour: number, minute = 0) =>
  new Date(year, month - 1, day, hour, minute).toISOString()
const now = new Date(2026, 10, 12, 9, 30)

test('a day is named Today, Yesterday, or by its date, in the viewer’s own time zone', () => {
  expect(dayLabel(at(2026, 11, 12, 0, 1), now)).toBe('Today')
  expect(dayLabel(at(2026, 11, 11, 23, 59), now)).toBe('Yesterday')
  expect(dayLabel(at(2026, 11, 10, 12), now)).toMatch(/10/)
  expect(dayLabel(at(2026, 11, 10, 12), now)).not.toMatch(/Today|Yesterday/)
  expect(dayLabel(at(2026, 11, 12, 23), now)).toBe('Today')
})

test('the day before a clock change is still Yesterday', () => {
  const afterFallBack = new Date(2026, 10, 2, 8)
  expect(dayLabel(at(2026, 11, 1, 0, 30), afterFallBack)).toBe('Yesterday')
  const afterSpringForward = new Date(2026, 2, 9, 8)
  expect(dayLabel(at(2026, 3, 8, 23, 30), afterSpringForward)).toBe('Yesterday')
})

test('items already in order are grouped under one heading per day', () => {
  const items = [
    at(2026, 11, 12, 9),
    at(2026, 11, 12, 1),
    at(2026, 11, 11, 22),
    at(2026, 11, 9, 8),
    at(2026, 11, 9, 7),
  ]
  const days = byDay(items, (item) => item, now)
  expect(days.map((day) => [day.label, day.items.length])).toEqual([
    ['Today', 2],
    ['Yesterday', 1],
    [dayLabel(at(2026, 11, 9, 8), now), 2],
  ])
  expect(byDay([], (item: string) => item, now)).toEqual([])
})
