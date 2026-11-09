import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, test } from 'vitest'
import type { Profile } from '../../shared/profile'
import { signInWithLinkedIn } from '../db/linkedin.fixture'
import * as schema from '../db/schema'
import { draftOfAgent, linkedInIdentity } from './builder'
import { saveProfile } from './save'

const client = postgres('postgresql://postgres:postgres@127.0.0.1:54322/postgres', { max: 4 })
const db = drizzle(client, { schema, casing: 'snake_case' })
afterAll(() => client.end())

const { people, profileDrafts } = schema
const services = { db, omnara: {} as never }
const userId = '00000000-0000-4000-8000-0000000000cc'
const agentId = 'builder-identity'
const picture =
  'https://media.licdn.com/dms/image/v2/D5603AQtest/profile-displayphoto-shrink_100_100/0/1'

beforeEach(async () => {
  await db.execute(sql`truncate profile_drafts, people cascade`)
  await db.execute(sql`delete from auth.users where id = ${userId}`)
  await db.execute(sql`
    insert into auth.users (id, raw_user_meta_data)
    values (${userId}, '{"name": "Someone Famous", "picture": "https://media.licdn.com/dms/image/v2/OTHER/x/0/1"}')`)
})

describe('LinkedIn identity', () => {
  test('comes from the identity record, never from user-editable metadata', async () => {
    await signInWithLinkedIn(userId, { name: 'Real Person', picture })
    expect(await linkedInIdentity(db, userId)).toEqual({ name: 'Real Person', picture })
  })

  test('is missing for a user without a LinkedIn identity', async () => {
    expect(await linkedInIdentity(db, userId)).toBeNull()
  })

  test('names the profile even when a stored draft or an edit says otherwise', async () => {
    await signInWithLinkedIn(userId, { name: 'Real Person', picture })
    const drafted = { name: 'Someone Famous', headline: 'Builder' } as Profile
    await db.insert(profileDrafts).values({
      userId,
      runId: '00000000-0000-4000-8000-0000000000dd',
      builderAgentId: agentId,
      links: [],
      profile: drafted,
      portrait: new Uint8Array([1]),
    })
    expect((await draftOfAgent(services, agentId))?.name).toBe('Real Person')
    await expect(
      saveProfile(services, {} as Env, userId, { ...drafted, name: 'Another Name' }),
    ).rejects.toThrow()
    const [person] = await db
      .select({ profile: people.profile })
      .from(people)
      .where(eq(people.userId, userId))
    expect(person!.profile.name).toBe('Real Person')
  })
})
