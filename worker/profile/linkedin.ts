import type { LinkedInIdentity } from './builder'
import { exaContents, exaFreshContents, exaPeople } from './exa'

const searchResults = 25

export type LinkedInProblem =
  'no-sign-in-photo' | 'not-found' | 'no-public-photo' | 'not-yours' | 'unreachable'

export const problemMessages: Record<LinkedInProblem, string> = {
  'no-sign-in-photo':
    'Add a profile photo on LinkedIn and make it visible to everyone, then sign out and join again.',
  'not-found': "We couldn't find your LinkedIn profile. Paste its URL and try again.",
  'no-public-photo':
    'Your LinkedIn photo must be visible to everyone. On LinkedIn, open "Edit public profile & URL", set your profile photo to Public, then try again.',
  'not-yours':
    "That LinkedIn profile's photo doesn't match the account you signed in with. If you changed your photo recently, sign out and join again.",
  unreachable: "We couldn't check LinkedIn just now. Try again in a minute.",
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

export function slugGuesses(name: string) {
  const parts = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  return parts.length < 2
    ? []
    : [...new Set([parts.join(''), parts.join('-')])].map(
        (slug) => `https://www.linkedin.com/in/${slug}`,
      )
}

export type VerifiedLinkedIn = { url: string }

async function verifyFresh(
  apiKey: string,
  url: string,
  signedIn: string,
): Promise<VerifiedLinkedIn | LinkedInProblem> {
  const [profile] = await exaFreshContents(apiKey, [url])
  if (!profile || profileUrl(profile.url) !== url) return 'unreachable'
  const photo = photoId(profile.image)
  if (!photo) return 'no-public-photo'
  return photo === signedIn ? { url } : 'not-yours'
}

export async function verifyLinkedIn(
  apiKey: string,
  identity: LinkedInIdentity,
  pasted: string | undefined,
): Promise<VerifiedLinkedIn | LinkedInProblem> {
  const signedIn = photoId(identity.picture)
  if (!signedIn) return 'no-sign-in-photo'
  try {
    if (pasted) {
      const url = profileUrl(pasted)
      return url ? await verifyFresh(apiKey, url, signedIn) : 'not-found'
    }
    const guesses = slugGuesses(identity.name)
    const [found, guessed] = await Promise.all([
      exaPeople(apiKey, identity.name, searchResults),
      guesses.length > 0 ? exaContents(apiKey, guesses).catch(() => []) : [],
    ])
    const match = [...found, ...guessed].find((result) => photoId(result.image) === signedIn)
    const url = match && profileUrl(match.url)
    return url ? await verifyFresh(apiKey, url, signedIn) : 'not-found'
  } catch {
    return 'unreachable'
  }
}
