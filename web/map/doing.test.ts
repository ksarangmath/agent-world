import { expect, test } from 'vitest'
import { places } from '../../shared/map/places'
import { doingNow } from './doing'
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

test('every place has a line for what people are doing there', () => {
  for (const place of places) {
    const line = doingNow(at(place.id), [])
    expect(line).not.toBe('taking it all in')
    expect(line.length).toBeLessThanOrEqual(60)
  }
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
