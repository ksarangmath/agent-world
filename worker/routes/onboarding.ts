import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireUser, type SignedIn } from '../auth'
import { database } from '../db/client'
import { people } from '../db/schema'
import { omnara } from '../omnara/client'
import { onboardingStatus, startBuilder } from '../profile/builder'

const startSchema = z.object({
  links: z.array(z.url({ protocol: /^https$/ }).max(300)).max(7),
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
    if (!body.success) return c.json({ error: 'Add your links and agree to the terms.' }, 400)
    const services = { db: database(c.env), omnara: omnara(c.env) }
    const [person] = await services.db
      .select({ id: people.id })
      .from(people)
      .where(eq(people.userId, c.var.userId))
    if (person) return c.json({ error: 'You already have an agent.' }, 409)
    await startBuilder(
      services,
      c.env,
      { id: c.var.userId, name: c.var.userName, photoUrl: c.var.photoUrl },
      body.data.links,
    )
    return c.json({ status: 'building' })
  })
