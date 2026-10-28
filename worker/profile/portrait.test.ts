import { afterEach, describe, expect, it, vi } from 'vitest'
import { drawPortrait } from './portrait'

const reply = (bytes: number[]) =>
  new Response(JSON.stringify({ data: [{ b64_json: btoa(String.fromCharCode(...bytes)) }] }))

afterEach(() => vi.unstubAllGlobals())

describe('drawPortrait', () => {
  it('redraws the photo through the edits endpoint', async () => {
    const fetch = vi.fn(async () => reply([1, 2, 3]))
    vi.stubGlobal('fetch', fetch)
    const image = await drawPortrait(
      'key',
      { mediaType: 'image/jpeg', data: btoa('jpeg') },
      'short gray hair',
    )
    expect([...image]).toEqual([1, 2, 3])
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/images/edits')
    const form = init.body as FormData
    expect(form.get('model')).toBe('gpt-image-2.5-sunburst')
    expect(form.get('output_compression')).toBe('80')
    expect(String(form.get('prompt'))).toContain('short gray hair')
    expect((form.get('image[]') as Blob).type).toBe('image/jpeg')
  })

  it('draws from the description when there is no photo', async () => {
    const fetch = vi.fn(async () => reply([4]))
    vi.stubGlobal('fetch', fetch)
    await drawPortrait('key', null, 'long black hair and round glasses')
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/images/generations')
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(body.output_compression).toBe(80)
    expect(String(body.prompt)).toContain('long black hair and round glasses')
  })

  it('throws when OpenAI refuses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 400 })),
    )
    await expect(drawPortrait('key', null, 'anyone')).rejects.toThrow('400')
  })
})
