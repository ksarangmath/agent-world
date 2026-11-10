import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireUser, type SignedIn } from '../auth'
import { database } from '../db/client'
import { people } from '../db/schema'
import { omnara } from '../omnara/client'
import {
  claimVerificationAttempt,
  linkedInIdentity,
  onboardingStatus,
  startBuilder,
} from '../profile/builder'
import { problemMessages, profileUrl, verifyLinkedIn } from '../profile/linkedin'

const startSchema = z.object({
  linkedin: z.string().trim().min(1).max(300),
  consent: z.literal(true),
})

export const onboarding = new Hono<SignedIn>()
  .use(requireUser)
  .get('/', async (c) => {
    const services = { db: database(c.env), omnara: omnara(c.env) }
    return c.json(await onboardingStatus(services, c.var.userId))
  })
  .post('/', async (c) => {
    const body = startSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) {
      return c.json({ error: 'Paste your LinkedIn profile address and agree to the terms.' }, 400)
    }
    const linkedinUrl = profileUrl(body.data.linkedin)
    if (!linkedinUrl) return c.json({ error: problemMessages['not-a-profile'] }, 422)
    const services = { db: database(c.env), omnara: omnara(c.env) }
    const [person] = await services.db
      .select({ id: people.id })
      .from(people)
      .where(eq(people.userId, c.var.userId))
    if (person) return c.json({ error: 'You already have an agent.' }, 409)
    if ((await onboardingStatus(services, c.var.userId)).status === 'building') {
      return c.json({ error: 'Your profile is already being built.' }, 409)
    }
    const identity = await linkedInIdentity(services.db, c.var.userId)
    if (!identity) return c.json({ error: 'Sign in with LinkedIn to build a profile.' }, 403)
    if (!(await claimVerificationAttempt(services.db, c.var.userId, new Date()))) {
      return c.json({ error: 'Too many tries today. Try again tomorrow.' }, 429)
    }
    const linkedIn = await verifyLinkedIn(c.env.EXA_API_KEY, identity, linkedinUrl)
    if (typeof linkedIn === 'string') return c.json({ error: problemMessages[linkedIn] }, 422)
    const started = await startBuilder(services, c.env, c.var.userId, identity.name, linkedIn)
    if (started === 'no photo') return c.json({ error: problemMessages.unreachable }, 422)
    return c.json({ status: 'building' })
  })
