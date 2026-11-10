import { afterEach, describe, expect, test, vi } from 'vitest'
import { downloadPhoto } from './builder'

const url =
  'https://media.licdn.com/dms/image/v2/D5603AQabc/profile-displayphoto-shrink_200_200/0/1'

function linkedIn(response: Response) {
  const fetch = vi.fn(async (_url: URL, _init: RequestInit) => response)
  vi.stubGlobal('fetch', fetch)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  return fetch
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('downloading the LinkedIn photo', () => {
  test('returns the image, asking the Workers runtime not to follow redirects', async () => {
    const fetch = linkedIn(new Response('jpeg', { headers: { 'content-type': 'image/jpeg' } }))
    expect(await downloadPhoto(url)).toEqual({ mediaType: 'image/jpeg', data: btoa('jpeg') })
    expect(fetch.mock.calls[0]![1].redirect).toBe('manual')
  })

  test('refuses a redirect', async () => {
    linkedIn(new Response(null, { status: 302, headers: { location: 'https://evil.example/' } }))
    expect(await downloadPhoto(url)).toBeNull()
  })

  test('refuses anything that is not an image', async () => {
    linkedIn(new Response('<html>', { headers: { 'content-type': 'text/html' } }))
    expect(await downloadPhoto(url)).toBeNull()
  })

  test('never fetches another host', async () => {
    const fetch = linkedIn(new Response('jpeg', { headers: { 'content-type': 'image/jpeg' } }))
    expect(await downloadPhoto('https://evil.example/dms/image/v2/D5603AQabc/x')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
})
