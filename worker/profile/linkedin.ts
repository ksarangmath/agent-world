import type { LinkedInIdentity } from './builder'
import { exaFreshContents } from './exa'

export type LinkedInProblem =
  'no-sign-in-photo' | 'not-a-profile' | 'no-public-photo' | 'not-yours' | 'unreachable'

export const problemMessages: Record<LinkedInProblem, string> = {
  'no-sign-in-photo':
    'Add a profile photo on LinkedIn and make it visible to everyone, then sign out and join again.',
  'not-a-profile':
    "That isn't a LinkedIn profile address. It looks like https://www.linkedin.com/in/your-name.",
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

export async function verifyLinkedIn(
  apiKey: string,
  identity: LinkedInIdentity,
  url: string,
): Promise<{ url: string } | LinkedInProblem> {
  const signedIn = photoId(identity.picture)
  if (!signedIn) return 'no-sign-in-photo'
  try {
    const [profile] = await exaFreshContents(apiKey, [url])
    if (!profile || profileUrl(profile.url) !== url) return 'unreachable'
    const photo = photoId(profile.image)
    if (!photo) return 'no-public-photo'
    return photo === signedIn ? { url } : 'not-yours'
  } catch {
    return 'unreachable'
  }
}
