import { describe, expect, test } from 'vitest'
import { nextBedtime, startOfDay } from './people'

const at = (iso: string) => new Date(iso)

describe('the Pacific day', () => {
  test('starts at midnight Pacific', () => {
    expect(startOfDay(at('2026-10-27T18:00:00Z'))).toEqual(at('2026-10-27T07:00:00Z'))
    expect(startOfDay(at('2026-12-01T18:00:00Z'))).toEqual(at('2026-12-01T08:00:00Z'))
  })

  test('keeps its midnight on the days the clocks change', () => {
    expect(startOfDay(at('2026-11-01T20:00:00Z'))).toEqual(at('2026-11-01T07:00:00Z'))
    expect(startOfDay(at('2027-03-14T19:00:00Z'))).toEqual(at('2027-03-14T08:00:00Z'))
  })

  test('bedtime is the next midnight Pacific, across a clock change too', () => {
    expect(nextBedtime(at('2026-10-27T18:00:00Z'))).toEqual(at('2026-10-28T07:00:00Z'))
    expect(nextBedtime(at('2026-10-28T07:00:00Z'))).toEqual(at('2026-10-29T07:00:00Z'))
    expect(nextBedtime(at('2026-11-01T20:00:00Z'))).toEqual(at('2026-11-02T08:00:00Z'))
    expect(nextBedtime(at('2027-03-14T19:00:00Z'))).toEqual(at('2027-03-15T07:00:00Z'))
  })
})
