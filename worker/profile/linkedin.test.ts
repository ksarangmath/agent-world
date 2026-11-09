import { afterEach, describe, expect, test, vi } from 'vitest'
import { photoId, profileUrl, verifyLinkedIn } from './linkedin'

type Result = { url: string; image?: string }

const photo = (id: string) =>
  `https://media.licdn.com/dms/image/v2/${id}/profile-displayphoto-shrink_200_200/0/1`
const identity = { name: 'Ada Lovelace', picture: photo('D5603AQsignedin') }
const url = 'https://www.linkedin.com/in/ada'

function exa(fresh: Result[] | Error) {
  const calls: Record<string, unknown>[] = []
  vi.stubGlobal('fetch', async (_input: string, init: RequestInit) => {
    calls.push(JSON.parse(String(init.body)) as Record<string, unknown>)
    if (fresh instanceof Error) throw fresh
    return Response.json({ results: fresh })
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
    expect(profileUrl('ada')).toBeNull()
  })
})

describe('verifying a pasted LinkedIn profile', () => {
  test('accepts it when a fresh fetch shows the sign-in photo', async () => {
    const calls = exa([{ url, image: photo('D5603AQsignedin') }])
    expect(await verifyLinkedIn('key', identity, url)).toEqual({ url })
    expect(calls).toEqual([expect.objectContaining({ urls: [url], maxAgeHours: 0 })])
  })

  test("rejects a profile with someone else's photo", async () => {
    exa([{ url, image: photo('D5603AQsomeoneelse') }])
    expect(await verifyLinkedIn('key', identity, url)).toBe('not-yours')
  })

  test('asks for a public photo when the public profile shows none', async () => {
    exa([{ url }])
    expect(await verifyLinkedIn('key', identity, url)).toBe('no-public-photo')
  })

  test('blocks a sign-in without a LinkedIn photo before fetching anything', async () => {
    const calls = exa([])
    expect(await verifyLinkedIn('key', { name: 'Ada Lovelace', picture: null }, url)).toBe(
      'no-sign-in-photo',
    )
    expect(calls).toHaveLength(0)
  })

  test('does not trust a fetch that landed on a different profile', async () => {
    exa([{ url: 'https://www.linkedin.com/in/someone-else', image: photo('D5603AQsignedin') }])
    expect(await verifyLinkedIn('key', identity, url)).toBe('unreachable')
  })

  test('reports LinkedIn as unreachable when the fetch fails', async () => {
    exa(new Error('network down'))
    expect(await verifyLinkedIn('key', identity, url)).toBe('unreachable')
  })
})
