import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { photoId, profileUrl, verifyLinkedIn } from './linkedin'

type Result = { url: string; image?: string }

const photo = (id: string) =>
  `https://media.licdn.com/dms/image/v2/${id}/profile-displayphoto-shrink_200_200/0/1`
const identity = { name: 'Ada Lovelace', picture: photo('D5603AQsignedin') }
const url = 'https://www.linkedin.com/in/ada'

function exa(...replies: (Result[] | Error | Response | 'not found')[]) {
  const calls: Record<string, unknown>[] = []
  vi.stubGlobal('fetch', async (_input: string, init: RequestInit) => {
    const reply = replies[Math.min(calls.length, replies.length - 1)]!
    calls.push(JSON.parse(String(init.body)) as Record<string, unknown>)
    if (reply instanceof Error) throw reply
    if (reply instanceof Response) return reply.clone()
    if (reply !== 'not found') return Response.json({ results: reply })
    return Response.json({
      results: [],
      statuses: [{ id: url, status: 'error', error: { tag: 'CRAWL_NOT_FOUND' } }],
    })
  })
  return calls
}

async function verify(who: Parameters<typeof verifyLinkedIn>[1] = identity) {
  const result = verifyLinkedIn('key', who, url)
  await vi.runAllTimersAsync()
  return result
}

beforeEach(() => void vi.useFakeTimers())

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

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
  const theirs = { url, photoUrl: photo('D5603AQsignedin') }
  const stored = expect.not.objectContaining({ maxAgeHours: expect.anything() })
  const fresh = expect.objectContaining({ urls: [url], maxAgeHours: 0, livecrawlTimeout: 25_000 })

  test('accepts a stored copy at once when it shows the sign-in photo', async () => {
    const calls = exa([{ url, image: photo('D5603AQsignedin') }])
    expect(await verify()).toEqual(theirs)
    expect(calls).toEqual([stored])
  })

  test('reads live when the stored copy is missing or shows another photo', async () => {
    const calls = exa(
      [{ url, image: photo('D5603AQold') }],
      [{ url, image: photo('D5603AQsignedin') }],
    )
    expect(await verify()).toEqual(theirs)
    expect(calls).toEqual([stored, fresh])
  })

  test('starts another live fetch every five seconds until one comes back', async () => {
    const calls = exa([], new Error('timed out'), [{ url, image: photo('D5603AQsignedin') }])
    const result = verifyLinkedIn('key', identity, url)
    await vi.advanceTimersByTimeAsync(4999)
    expect(calls).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(await result).toEqual(theirs)
    await vi.runAllTimersAsync()
    expect(calls).toEqual([stored, fresh, fresh])
  })

  test("rejects a profile with someone else's photo, but only on a live fetch", async () => {
    const calls = exa([{ url, image: photo('D5603AQsomeoneelse') }])
    expect(await verify()).toBe('not-yours')
    expect(calls).toEqual([stored, fresh])
  })

  test('asks for a public photo when the public profile shows none', async () => {
    exa([{ url }])
    expect(await verify()).toBe('no-public-photo')
  })

  test('blocks a sign-in without a LinkedIn photo before fetching anything', async () => {
    const calls = exa([])
    expect(await verify({ name: 'Ada Lovelace', picture: null })).toBe('no-sign-in-photo')
    expect(calls).toHaveLength(0)
  })

  test('says there is no public profile only after two live fetches say so', async () => {
    const calls = exa('not found')
    expect(await verify()).toBe('not-found')
    expect(calls).toEqual([stored, fresh, fresh])
  })

  test('one live fetch that finds nothing does not stop a later one that finds the profile', async () => {
    exa('not found', 'not found', [{ url, image: photo('D5603AQsignedin') }])
    expect(await verify()).toEqual(theirs)
  })

  test('does not trust a fetch that landed on a different profile', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    exa([{ url: 'https://www.linkedin.com/in/someone-else', image: photo('D5603AQsignedin') }])
    expect(await verify()).toBe('unreachable')
    expect(log).toHaveBeenCalledWith('LinkedIn check failed', 'no profile')
  })

  test('reports LinkedIn as unreachable after five live fetches that come back empty or fail', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const calls = exa([], [], new Error('network down'))
    expect(await verify()).toBe('unreachable')
    expect(calls).toHaveLength(6)
    expect(log).toHaveBeenCalledWith('LinkedIn check failed', 'no profile, Error')
  })

  test('logs what kind of failure it was, never what Exa or the network said', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    exa(
      [],
      new Response('<html>Ada Lovelace, ada@example.com</html>'),
      new Response('rate limited for key abc', { status: 429 }),
      Response.json({
        results: [],
        statuses: [{ error: { tag: 'CRAWL_LIVECRAWL_TIMEOUT' } }, { error: { tag: 'see ada' } }],
      }),
      new TypeError('fetch failed for https://www.linkedin.com/in/ada'),
    )
    expect(await verify()).toBe('unreachable')
    expect(log).toHaveBeenCalledWith(
      'LinkedIn check failed',
      'SyntaxError, Error 429, CRAWL_LIVECRAWL_TIMEOUT, TypeError',
    )
  })
})
