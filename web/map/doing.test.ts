import { expect, test } from 'vitest'
import { places } from '../../shared/map/places'
import { doing, doingNow } from './doing'
import type { WorldPerson } from '../../shared/api'

const at = (placeId: string): WorldPerson => ({
  id: placeId,
  name: 'Someone',
  avatar: {} as WorldPerson['avatar'],
  placeId,
  tile: { x: 0, y: 0 },
  trip: null,
  conversationId: null,
  asleep: false,
})

test('every place has many short lines for what people are doing there', () => {
  for (const place of places) {
    const lines = doing[place.id] ?? []
    expect(new Set(lines).size, place.id).toBeGreaterThanOrEqual(8)
    for (const line of lines) {
      expect(line.length, line).toBeLessThanOrEqual(60)
      expect(line, line).not.toMatch(/[—–;]|--/)
    }
  }
})

test('people in one place do different things, and each changes every few minutes', () => {
  const now = Date.parse('2026-11-11T20:00:00Z')
  const crowd = Array.from({ length: 12 }, (_, i) => ({ ...at('arcade'), id: `person-${i}` }))
  expect(new Set(crowd.map((person) => doingNow(person, [], now))).size).toBeGreaterThanOrEqual(4)
  const [someone] = crowd
  const day = Array.from({ length: 6 * 60 }, (_, minute) =>
    doingNow(someone!, [], now + minute * 60_000),
  )
  expect(day.every((line) => doing.arcade!.includes(line))).toBe(true)
  expect(new Set(day).size).toBeGreaterThanOrEqual(5)
  const changes = day.filter((line, minute) => minute > 0 && line !== day[minute - 1]).length
  expect(changes).toBeGreaterThanOrEqual((6 * 60) / 4 - 1)
  expect(changes).toBeLessThanOrEqual((6 * 60) / 4)
  const every = Array.from({ length: 12 }, (_, turn) =>
    doingNow(someone!, [], now + turn * 4 * 60_000),
  )
  expect(every.every((line, turn) => turn === 0 || line !== every[turn - 1])).toBe(true)
  expect(new Set(every.slice(0, 8)).size).toBe(8)
})

test('travel and conversations take over the line', () => {
  const partner = { ...at('arcade'), id: 'p', name: 'Mei', conversationId: 'c' }
  const person = { ...at('arcade'), conversationId: 'c' }
  expect(doingNow(person, [person, partner])).toBe('deep in it with Mei')
  expect(
    doingNow({ ...person, trip: { from: { x: 0, y: 0 }, departedAt: '', arrivesAt: '' } }, []),
  ).toBe('on the way to The Extra Life Arcade')
})

test('someone asleep is asleep, whatever the place is for', () => {
  expect(doingNow({ ...at('arcade'), asleep: true }, [])).toBe('fast asleep')
})
