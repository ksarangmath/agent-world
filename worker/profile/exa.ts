import { z } from 'zod'

const timeoutMs = 20_000
const maxCharacters = 3000

const resultsSchema = z.object({
  results: z.array(
    z.object({
      url: z.string(),
      title: z.string().nullish(),
      author: z.string().nullish(),
      publishedDate: z.string().nullish(),
      text: z.string().nullish(),
    }),
  ),
})

async function exa(apiKey: string, endpoint: 'search' | 'contents', body: object) {
  const response = await fetch(`https://api.exa.ai/${endpoint}`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error(`Exa ${endpoint} failed with ${response.status}`)
  return resultsSchema.parse(await response.json()).results.map((result) => ({
    url: result.url,
    title: result.title ?? null,
    author: result.author ?? null,
    published: result.publishedDate ?? null,
    text: result.text?.slice(0, maxCharacters) ?? null,
  }))
}

export const exaSearch = (apiKey: string, query: string, results: number) =>
  exa(apiKey, 'search', { query, numResults: results, contents: { text: { maxCharacters } } })

export const exaContents = (apiKey: string, urls: string[]) =>
  exa(apiKey, 'contents', { urls, text: { maxCharacters } })
