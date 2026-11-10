import { expect, test } from 'vitest'
import { places } from '../../shared/map/places'
import { doing } from './doing'

test('every place has a line for what people are doing there', () => {
  expect(Object.keys(doing).sort()).toEqual(places.map((place) => place.id).sort())
  for (const line of Object.values(doing)) expect(line.length).toBeLessThanOrEqual(60)
})
