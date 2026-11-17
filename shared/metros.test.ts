import { describe, expect, test } from 'vitest'
import { isMetro, metroAt, metroInfo, metros } from './metros'

describe('which map a page shows', () => {
  test('is the Bay everywhere except under another city’s path', () => {
    for (const path of ['/', '', '/people/abc', '/how-it-works', '/terms']) {
      expect(metroAt(path), path).toBe('bay')
    }
  })

  test('is Austin at /austin and on every page under it', () => {
    for (const path of ['/austin', '/austin/', '/austin/people/abc', '/austin/how-it-works']) {
      expect(metroAt(path), path).toBe('austin')
    }
  })

  test('is not fooled by a path that only starts with a city’s name', () => {
    for (const path of ['/austinite', '/austin-people', '/people/austin', '/Austin']) {
      expect(metroAt(path), path).toBe('bay')
    }
  })

  test('gives every city its own path and time zone', () => {
    expect(new Set(metros.map((metro) => metroInfo[metro].path)).size).toBe(metros.length)
    for (const metro of metros) {
      const { timeZone } = metroInfo[metro]
      expect(() => new Intl.DateTimeFormat('en-US', { timeZone }), metro).not.toThrow()
    }
    expect(isMetro('austin')).toBe(true)
    expect(isMetro('dallas')).toBe(false)
  })
})
