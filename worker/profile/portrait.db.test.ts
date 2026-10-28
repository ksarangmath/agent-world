import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, test } from 'vitest'
import type { Profile } from '../../shared/profile'
import * as schema from '../db/schema'
import { claimPortrait, finishPortrait } from '../tools/run'
import { done } from '../world/events'
import { createPerson, updateProfile } from '../world/people'
import { saveDraft } from './builder'
import { saveProfile } from './save'

const client = postgres('postgresql://postgres:postgres@127.0.0.1:54322/postgres', { max: 8 })
const db = drizzle(client, { schema, casing: 'snake_case' })
afterAll(() => client.end())

const { people, profileDrafts } = schema
const userId = '00000000-0000-4000-8000-0000000000aa'
const agentId = 'builder-agent'
const t0 = new Date('2026-10-27T18:00:00Z')
const call = (id: string) => ({ id, agent_id: agentId, name: 'draw_portrait', input: {} })
const image = new Uint8Array([1, 2, 3])
const profile = { name: 'Test Person' } as Profile

beforeEach(async () => {
  await db.execute(sql`truncate handled_tool_calls, profile_drafts, people cascade`)
  await db.execute(sql`delete from auth.users where id = ${userId}`)
  await db.execute(
    sql`insert into auth.users (id, email) values (${userId}, 'portrait@test.invalid')`,
  )
  await db.insert(profileDrafts).values({
    userId,
    runId: '00000000-0000-4000-8000-0000000000bb',
    builderAgentId: agentId,
    links: [],
  })
})

const save = () => db.transaction((tx) => saveDraft(tx, userId, agentId, profile))

describe('portrait lifecycle', () => {
  test('one claim wins when the same call runs twice at once', async () => {
    const claims = await Promise.all([
      claimPortrait(db, userId, call('a'), t0),
      claimPortrait(db, userId, call('a'), t0),
    ])
    expect(claims.map((claim) => claim.kind).sort()).toEqual(['busy', 'claimed'])
  })

  test('a retry after finishing returns the recorded result without redrawing', async () => {
    const claim = await claimPortrait(db, userId, call('a'), t0)
    expect(claim.kind).toBe('claimed')
    const row = await finishPortrait(db, userId, call('a'), t0, image, done('Drew it.'))
    expect(row).toBeDefined()
    const retry = await claimPortrait(db, userId, call('a'), t0)
    expect(retry.kind).toBe('handled')
  })

  test('a second draw after the portrait exists is refused', async () => {
    await claimPortrait(db, userId, call('a'), t0)
    await finishPortrait(db, userId, call('a'), t0, image, done('Drew it.'))
    const second = await claimPortrait(db, userId, call('b'), t0)
    expect(second.kind).toBe('handled')
    if (second.kind === 'handled') {
      expect(JSON.stringify(second.row.result)).toContain('already drawn')
    }
  })

  test('a stale claim can be taken over, and the old run cannot write', async () => {
    await claimPortrait(db, userId, call('a'), t0)
    const later = new Date(t0.getTime() + 6 * 60 * 1000)
    expect((await claimPortrait(db, userId, call('b'), later)).kind).toBe('claimed')
    expect(await finishPortrait(db, userId, call('a'), t0, image, done('Drew it.'))).toBeUndefined()
    const [draft] = await db
      .select({ portrait: profileDrafts.portrait })
      .from(profileDrafts)
      .where(eq(profileDrafts.userId, userId))
    expect(draft!.portrait).toBeNull()
  })

  test('submitting needs a portrait, and drawing after submitting is refused', async () => {
    expect(await save()).toBe('needs portrait')
    await claimPortrait(db, userId, call('a'), t0)
    expect(await save()).toBe('needs portrait')
    await finishPortrait(db, userId, call('a'), t0, image, done('Drew it.'))
    expect(await save()).toBe('saved')
    const late = await claimPortrait(db, userId, call('c'), t0)
    expect(late.kind).toBe('handled')
  })

  test('the portrait survives later profile edits', async () => {
    const person = await db.transaction((tx) =>
      createPerson({ tx, now: t0, deliveries: [] }, userId, profile, image),
    )
    await db.transaction((tx) =>
      updateProfile({ tx, now: t0, deliveries: [] }, person.id, profile, null),
    )
    const [row] = await db
      .select({ portrait: people.portrait })
      .from(people)
      .where(eq(people.id, person.id))
    expect([...row!.portrait!]).toEqual([1, 2, 3])
  })

  test('saving keeps the saved portrait and only takes a finished draft on first save', async () => {
    const services = { db, omnara: {} as never }
    const env = {} as Env
    await db
      .update(profileDrafts)
      .set({ profile, portrait: new Uint8Array([7]) })
      .where(eq(profileDrafts.userId, userId))
    await expect(saveProfile(services, env, userId, profile)).rejects.toThrow()
    const portraitOf = async () =>
      (
        await db.select({ portrait: people.portrait }).from(people).where(eq(people.userId, userId))
      )[0]!.portrait
    expect([...(await portraitOf())!]).toEqual([7])
    await db.update(people).set({ agentId: 'world-agent' }).where(eq(people.userId, userId))
    await db
      .update(profileDrafts)
      .set({ profile: null, portrait: new Uint8Array([9]) })
      .where(eq(profileDrafts.userId, userId))
    await saveProfile(services, env, userId, profile)
    expect([...(await portraitOf())!]).toEqual([7])
  })
})
