import { z } from 'zod'

const timeoutMs = 20_000
const freshCrawlMs = 25_000
const maxCharacters = 3000

const responseSchema = z.object({
  results: z.array(
    z.object({
      url: z.string(),
      title: z.string().nullish(),
      author: z.string().nullish(),
      publishedDate: z.string().nullish(),
      text: z.string().nullish(),
      image: z.string().nullish(),
    }),
  ),
  statuses: z
    .array(
      z.object({
        error: z
          .object({
            tag: z
              .string()
              .regex(/^[A-Z0-9_]{1,40}$/)
              .nullish()
              .catch(null),
          })
          .nullish(),
      }),
    )
    .nullish(),
})

async function exa(
  apiKey: string,
  endpoint: 'search' | 'contents',
  body: object,
  signal = AbortSignal.timeout(timeoutMs),
) {
  const response = await fetch(`https://api.exa.ai/${endpoint}`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!response.ok) {
    throw Object.assign(new Error(`Exa ${endpoint} failed with ${response.status}`), {
      status: response.status,
    })
  }
  const { results, statuses } = responseSchema.parse(await response.json())
  return {
    results: results.map((result) => ({
      url: result.url,
      title: result.title ?? null,
      author: result.author ?? null,
      published: result.publishedDate ?? null,
      text: result.text?.slice(0, maxCharacters) ?? null,
      image: result.image ?? null,
    })),
    errors: (statuses ?? []).flatMap((status) => status.error?.tag ?? []),
  }
}

export const exaSearch = async (apiKey: string, query: string, results: number) =>
  (
    await exa(apiKey, 'search', {
      query,
      numResults: results,
      contents: { text: { maxCharacters } },
    })
  ).results

export const exaContents = async (apiKey: string, urls: string[], signal?: AbortSignal) =>
  (await exa(apiKey, 'contents', { urls, text: { maxCharacters } }, signal)).results

// https://exa.ai/docs/reference/get-contents
// https://exa.ai/docs/admin/error-codes
export const exaFreshContents = (apiKey: string, urls: string[], stop: AbortSignal) =>
  exa(
    apiKey,
    'contents',
    { urls, text: { maxCharacters }, maxAgeHours: 0, livecrawlTimeout: freshCrawlMs },
    AbortSignal.any([stop, AbortSignal.timeout(freshCrawlMs + 5000)]),
  )
