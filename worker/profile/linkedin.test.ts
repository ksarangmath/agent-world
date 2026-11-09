import { afterEach, describe, expect, test, vi } from 'vitest'
import { photoId, profileUrl, slugGuesses, verifyLinkedIn } from './linkedin'

type Result = { url: string; image?: string }

const photo = (id: string) =>
  `https://media.licdn.com/dms/image/v2/${id}/profile-displayphoto-shrink_200_200/0/1`
const identity = { name: 'Ada Lovelace', picture: photo('D5603AQsignedin') }
const mine = (url: string): Result => ({ url, image: photo('D5603AQsignedin') })

function exa(results: { search?: Result[]; cached?: Result[]; fresh?: Result[] }) {
  const calls: { kind: string; body: Record<string, unknown> }[] = []
  vi.stubGlobal('fetch', async (input: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    const kind = input.endsWith('/search') ? 'search' : body.maxAgeHours === 0 ? 'fresh' : 'cached'
    calls.push({ kind, body })
    return Response.json({ results: results[kind as keyof typeof results] ?? [] })
  })
  return calls
}

afterEach(() => vi.unstubAllGlobals())

describe('LinkedIn URLs', () => {
  test('reads the image ID from LinkedIn photo URLs only', () => {
    expect(photoId(photo('D5603AQabc'))).toBe('D5603AQabc')
    expect(photoId('https://evil.example/dms/image/v2/D5603AQabc/x')).toBeNull()
    expect(photoId(null)).toBeNull()
  })

  test('accepts only https LinkedIn profile paths', () => {
    expect(profileUrl('https://uk.linkedin.com/in/AdaLovelace/')).toBe(
      'https://www.linkedin.com/in/adalovelace',
    )
    expect(profileUrl('https://linkedin.com.evil.example/in/ada')).toBeNull()
    expect(profileUrl('https://www.linkedin.com/company/ada')).toBeNull()
    expect(profileUrl('http://www.linkedin.com/in/ada')).toBeNull()
  })

  test('guesses the usual vanity slugs from a name', () => {
    expect(slugGuesses('Ada Lovelace')).toEqual([
      'https://www.linkedin.com/in/adalovelace',
      'https://www.linkedin.com/in/ada-lovelace',
    ])
    expect(slugGuesses('Madonna')).toEqual([])
  })
})

describe('verifying a LinkedIn profile', () => {
  test('accepts a pasted profile whose fresh photo matches the sign-in photo', async () => {
    const calls = exa({ fresh: [mine('https://www.linkedin.com/in/ada')] })
    expect(await verifyLinkedIn('key', identity, 'https://www.linkedin.com/in/ada')).toEqual({
      url: 'https://www.linkedin.com/in/ada',
    })
    expect(calls.map((call) => call.kind)).toEqual(['fresh'])
  })

  test("rejects a pasted profile with someone else's photo", async () => {
    exa({
      fresh: [{ url: 'https://www.linkedin.com/in/famous', image: photo('D5603AQsomeoneelse') }],
    })
    expect(await verifyLinkedIn('key', identity, 'https://www.linkedin.com/in/famous')).toBe(
      'not-yours',
    )
  })

  test('asks for a public photo when the public profile shows none', async () => {
    exa({ fresh: [{ url: 'https://www.linkedin.com/in/ada' }] })
    expect(await verifyLinkedIn('key', identity, 'https://www.linkedin.com/in/ada')).toBe(
      'no-public-photo',
    )
  })

  test('blocks a sign-in without a LinkedIn photo before looking anything up', async () => {
    const calls = exa({})
    expect(await verifyLinkedIn('key', { name: 'Ada Lovelace', picture: null }, undefined)).toBe(
      'no-sign-in-photo',
    )
    expect(calls).toHaveLength(0)
  })

  test('finds the profile by name, then confirms it with a fresh fetch', async () => {
    const calls = exa({
      search: [
        { url: 'https://www.linkedin.com/in/ada-l-123', image: photo('D5603AQother') },
        mine('https://linkedin.com/in/AdaReal'),
      ],
      fresh: [mine('https://www.linkedin.com/in/adareal')],
    })
    expect(await verifyLinkedIn('key', identity, undefined)).toEqual({
      url: 'https://www.linkedin.com/in/adareal',
    })
    expect(calls.at(-1)).toMatchObject({ kind: 'fresh', body: { urls: [expect.any(String)] } })
  })

  test('finds the profile at a guessed vanity URL', async () => {
    exa({
      cached: [mine('https://www.linkedin.com/in/ada-lovelace')],
      fresh: [mine('https://www.linkedin.com/in/ada-lovelace')],
    })
    expect(await verifyLinkedIn('key', identity, undefined)).toEqual({
      url: 'https://www.linkedin.com/in/ada-lovelace',
    })
  })

  test('rejects a cached match when the live profile shows another photo', async () => {
    exa({
      cached: [mine('https://www.linkedin.com/in/adalovelace')],
      fresh: [{ url: 'https://www.linkedin.com/in/adalovelace', image: photo('D5603AQnewowner') }],
    })
    expect(await verifyLinkedIn('key', identity, undefined)).toBe('not-yours')
  })

  test('asks for the URL when no candidate has the same photo', async () => {
    exa({
      search: [{ url: 'https://www.linkedin.com/in/namesake', image: photo('D5603AQnamesake') }],
    })
    expect(await verifyLinkedIn('key', identity, undefined)).toBe('not-found')
  })

  test('rejects a pasted URL that is not a LinkedIn profile without fetching it', async () => {
    const calls = exa({})
    expect(await verifyLinkedIn('key', identity, 'https://example.com/in/ada')).toBe('not-found')
    expect(calls).toHaveLength(0)
  })
})
