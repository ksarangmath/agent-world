import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { profileSchema } from '../../shared/profile'
import { maxOwnerMessageLength } from '../../shared/world'
import type { MeResponse } from '../../shared/api'
import { requireUser, type SignedIn } from '../auth'
import { database } from '../db/client'
import type { Database } from '../db/client'
import { people, profileDrafts } from '../db/schema'
import { omnara } from '../omnara/client'
import { saveProfile } from '../profile/save'
import { sendDeliveries } from '../tools/run'
import { messageAgent } from '../world/owner-thread'
import { myConversations, myMatches, thread } from '../world/reads'

const personOf = async (db: Database, userId: string) =>
  (await db.select({ id: people.id }).from(people).where(eq(people.userId, userId)))[0]

export const me = new Hono<SignedIn>()
  .use(requireUser)
  .get('/', async (c) => {
    const [row] = await database(c.env)
      .select({ id: people.id, profile: people.profile, x: people.tileX, y: people.tileY })
      .from(people)
      .where(eq(people.userId, c.var.userId))
    const person = row && {
      id: row.id,
      profile: row.profile,
      tile: row.x === null || row.y === null ? null : { x: row.x, y: row.y },
    }
    return c.json<MeResponse>({ person: person ?? null })
  })
  .get('/portrait', async (c) => {
    const db = database(c.env)
    const [person] = await db
      .select({ portrait: people.portrait })
      .from(people)
      .where(eq(people.userId, c.var.userId))
    const [draft] = await db
      .select({ portrait: profileDrafts.portrait })
      .from(profileDrafts)
      .where(eq(profileDrafts.userId, c.var.userId))
    const image = draft?.portrait ?? person?.portrait
    if (!image) return c.notFound()
    return c.body(new Uint8Array(image), 200, {
      'Content-Type': 'image/webp',
      'Cache-Control': 'private, no-store',
    })
  })
  .put('/profile', async (c) => {
    const parsed = profileSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: z.prettifyError(parsed.error) }, 400)
    const services = { db: database(c.env), omnara: omnara(c.env) }
    const id = await saveProfile(services, c.env, c.var.userId, parsed.data)
    if (!id) return c.json({ error: 'Build your profile first.' }, 409)
    return c.json({ person: { id } })
  })
  .get('/conversations', async (c) => {
    const db = database(c.env)
    const person = await personOf(db, c.var.userId)
    return c.json(person ? await myConversations(db, person.id) : [])
  })
  .get('/matches', async (c) => {
    const db = database(c.env)
    const person = await personOf(db, c.var.userId)
    return c.json(person ? await myMatches(db, person.id) : { verdicts: [], mutual: [] })
  })
  .get('/thread', async (c) => {
    const db = database(c.env)
    const person = await personOf(db, c.var.userId)
    return c.json(person ? await thread(db, person.id) : [])
  })
  .post('/thread', async (c) => {
    const body = z
      .object({ text: z.string().trim().min(1).max(maxOwnerMessageLength) })
      .safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'Write a message of up to 500 characters.' }, 400)
    const services = { db: database(c.env), omnara: omnara(c.env) }
    const person = await personOf(services.db, c.var.userId)
    if (!person) return c.json({ error: 'Create your agent first.' }, 409)
    const deliveries = await services.db.transaction(async (tx) => {
      const world = { tx, now: new Date(), deliveries: [] as string[] }
      await messageAgent(world, person.id, body.data.text)
      return world.deliveries
    })
    await sendDeliveries(services, deliveries)
    return c.json(await thread(services.db, person.id))
  })
