import type { LinkedInIdentity } from './builder'
import { exaContents, exaFreshContents } from './exa'

export type LinkedInProblem =
  | 'no-sign-in-photo'
  | 'not-a-profile'
  | 'not-found'
  | 'no-public-photo'
  | 'not-yours'
  | 'unreachable'

export const problemMessages: Record<LinkedInProblem, string> = {
  'no-sign-in-photo':
    'Add a profile photo on LinkedIn and make it visible to everyone, then sign out and join again.',
  'not-a-profile':
    "That isn't a LinkedIn profile address. It looks like https://www.linkedin.com/in/your-name.",
  'not-found':
    'We couldn\'t find a public LinkedIn profile at that address. Check the link. If it\'s right, open "Edit public profile & URL" on LinkedIn, turn on your public profile, then try again.',
  'no-public-photo':
    'Your LinkedIn photo must be visible to everyone. On LinkedIn, open "Edit public profile & URL", set your profile photo to Public, then try again.',
  'not-yours':
    "That isn't the LinkedIn profile you signed in with: its photo doesn't match yours. Paste the address of your own profile. If you changed your LinkedIn photo recently, sign out and join again.",
  unreachable:
    "We couldn't reach LinkedIn after several tries. Nothing is wrong on your side. Try again in a few minutes.",
}

export const photoId = (url: string | null | undefined) =>
  url?.match(/^https:\/\/media\.licdn\.com\/dms\/image\/v2\/([A-Za-z0-9_-]+)\//)?.[1] ?? null

export function profileUrl(value: string) {
  if (!URL.canParse(value)) return null
  const url = new URL(value)
  const slug = url.pathname.match(/^\/in\/([A-Za-z0-9_%-]{3,100})\/?$/)?.[1]
  const linkedIn = url.hostname === 'linkedin.com' || url.hostname.endsWith('.linkedin.com')
  return url.protocol === 'https:' && linkedIn && slug
    ? `https://www.linkedin.com/in/${slug.toLowerCase()}`
    : null
}

const tries = 5
const everyMs = 5000
const notFoundTwice = 2

const pause = (ms: number, stop: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    stop.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new Error('stopped'))
    })
  })

function failure(error: unknown) {
  if (!(error instanceof Error)) return 'failed'
  const { status } = error as { status?: number }
  return typeof status === 'number' ? `${error.name} ${status}` : error.name
}

export async function verifyLinkedIn(
  apiKey: string,
  identity: LinkedInIdentity,
  url: string,
): Promise<{ url: string; photoUrl: string } | LinkedInProblem> {
  const signedIn = photoId(identity.picture)
  if (!signedIn) return 'no-sign-in-photo'
  const stop = new AbortController()
  const failures = new Set<string>()
  let missing = 0
  const stored = async () => {
    const copies = await exaContents(apiKey, [url], stop.signal)
    const profile = copies.find((copy) => profileUrl(copy.url) === url)
    if (profile && photoId(profile.image) === signedIn) return profile
    throw new Error('no stored copy with the sign-in photo')
  }
  const read = async (attempt: number) => {
    await pause(attempt * everyMs, stop.signal)
    try {
      const { results, errors } = await exaFreshContents(apiKey, [url], stop.signal)
      const profile = results.find((result) => profileUrl(result.url) === url)
      if (profile) return profile
      if (errors.includes('CRAWL_NOT_FOUND') && ++missing >= notFoundTwice) return null
      for (const error of errors.length > 0 ? errors : ['no profile']) failures.add(error)
    } catch (error) {
      failures.add(failure(error))
    }
    throw new Error('LinkedIn profile not read')
  }
  try {
    const profile = await Promise.any([
      stored(),
      ...Array.from({ length: tries }, (_, attempt) => read(attempt)),
    ])
    if (!profile) return 'not-found'
    const photo = photoId(profile.image)
    if (!profile.image || !photo) return 'no-public-photo'
    return photo === signedIn ? { url, photoUrl: profile.image } : 'not-yours'
  } catch {
    console.error('LinkedIn check failed', [...failures].join(', '))
    return 'unreachable'
  } finally {
    stop.abort()
  }
}
