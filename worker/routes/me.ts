import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import type { MeResponse } from '../../shared/api'
import { requireUser, type SignedIn } from '../auth'
import { database } from '../db/client'
import { people } from '../db/schema'

export const me = new Hono<SignedIn>().use(requireUser).get('/', async (c) => {
  const [person] = await database(c.env)
    .select({ id: people.id })
    .from(people)
    .where(eq(people.userId, c.var.userId))
  return c.json<MeResponse>({ person: person ?? null })
})
