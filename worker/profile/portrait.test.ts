import { afterEach, describe, expect, it, vi } from 'vitest'
import { drawPortrait } from './portrait'

const reply = (bytes: number[]) =>
  new Response(JSON.stringify({ data: [{ b64_json: btoa(String.fromCharCode(...bytes)) }] }))

const photo = { mediaType: 'image/jpeg' as const, data: btoa('jpeg') }

afterEach(() => vi.unstubAllGlobals())

describe('drawPortrait', () => {
  it('redraws the photo through the edits endpoint', async () => {
    const fetch = vi.fn(async () => reply([1, 2, 3]))
    vi.stubGlobal('fetch', fetch)
    const image = await drawPortrait('key', photo, 'short gray hair')
    expect([...image]).toEqual([1, 2, 3])
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/images/edits')
    const form = init.body as FormData
    expect(form.get('model')).toBe('gpt-image-2.5-sunburst')
    expect(form.get('output_compression')).toBe('80')
    expect(String(form.get('prompt'))).toContain('short gray hair')
    expect((form.get('image[]') as Blob).type).toBe('image/jpeg')
  })

  it('throws when OpenAI refuses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 400 })),
    )
    await expect(drawPortrait('key', photo, 'anyone')).rejects.toThrow('400')
  })
})
