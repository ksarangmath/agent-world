import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, test } from 'vitest'
import type { Profile } from '../../shared/profile'
import { signInWithLinkedIn } from '../db/linkedin.fixture'
import * as schema from '../db/schema'
import { runBuilderCall } from '../tools/run'
import { claimVerificationAttempt, linkedInIdentity } from './builder'
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

const submitted: Profile = {
  name: 'Someone Famous',
  headline: 'Engineer',
  age: null,
  city: null,
  bio: 'Builds things.',
  current_work: '',
  expertise: [],
  interests: ['robotics'],
  hobbies: ['chess', 'coffee', 'hiking'],
  looking_for: '',
  avoid: '',
  conversation_style: '',
  fun_facts: [],
  links: [],
  avatar: {
    gender: 'female',
    skin_tone: '#c68642',
    eye_color: 'brown',
    hair_color: '#2c1b10',
    hair_style: 'bob',
    facial_hair: 'none',
    glasses: 'none',
    top_style: 't-shirt',
    top_color: '#3366cc',
    bottom_style: 'pants',
    bottom_color: '#222222',
    shoe_color: '#111111',
  },
  sources: [],
}

beforeEach(async () => {
  await db.execute(
    sql`truncate profile_drafts, people, handled_tool_calls, verification_attempts cascade`,
  )
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

  test("returns each person's own identity, never another user's", async () => {
    const other = '00000000-0000-4000-8000-0000000000ee'
    await db.execute(sql`delete from auth.users where id = ${other}`)
    await db.execute(sql`insert into auth.users (id) values (${other})`)
    await signInWithLinkedIn(other, { name: 'Other Person', picture: null })
    await signInWithLinkedIn(userId, { name: 'Real Person', picture })
    expect((await linkedInIdentity(db, userId))?.name).toBe('Real Person')
    expect((await linkedInIdentity(db, other))?.name).toBe('Other Person')
    await db.execute(sql`delete from auth.users where id = ${other}`)
  })

  test("submit_profile names each draft after its own owner's LinkedIn identity", async () => {
    const other = '00000000-0000-4000-8000-0000000000ee'
    await db.execute(sql`delete from auth.users where id = ${other}`)
    await db.execute(sql`insert into auth.users (id) values (${other})`)
    await signInWithLinkedIn(other, { name: 'Other Person', picture: null })
    await signInWithLinkedIn(userId, { name: 'Real Person', picture })
    const owners = [
      { user: userId, agent: agentId, name: 'Real Person' },
      { user: other, agent: 'builder-other', name: 'Other Person' },
    ]
    for (const [i, owner] of owners.entries()) {
      await db.insert(profileDrafts).values({
        userId: owner.user,
        runId: `00000000-0000-4000-8000-00000000010${i}`,
        builderAgentId: owner.agent,
        links: [],
        linkedinUrl: `https://www.linkedin.com/in/${owner.agent}`,
        portrait: new Uint8Array([1]),
      })
      const { name: _, links: __, ...input } = submitted
      const answer = await runBuilderCall(services, {} as Env, {
        agentID: owner.agent,
        toolCallID: `tc-submit-${i}`,
        name: 'submit_profile',
        input,
      })
      expect(answer).toMatchObject({ outcome: 'succeeded' })
    }
    for (const owner of owners) {
      const [draft] = await db
        .select({ profile: profileDrafts.profile })
        .from(profileDrafts)
        .where(eq(profileDrafts.userId, owner.user))
      expect(draft!.profile!.name).toBe(owner.name)
    }
    await db.execute(sql`delete from auth.users where id = ${other}`)
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
      linkedinUrl: 'https://www.linkedin.com/in/test-person',
      profile: drafted,
      portrait: new Uint8Array([1]),
    })
    await expect(
      saveProfile(services, {} as Env, userId, { ...drafted, name: 'Another Name' }),
    ).rejects.toThrow()
    const [person] = await db
      .select({ profile: people.profile })
      .from(people)
      .where(eq(people.userId, userId))
    expect(person!.profile.name).toBe('Real Person')
  })

  test('allows ten verification attempts a day, even when they race', async () => {
    const now = new Date('2026-11-09T12:00:00Z')
    const claims = await Promise.all(
      Array.from({ length: 15 }, () => claimVerificationAttempt(db, userId, now)),
    )
    expect(claims.filter(Boolean)).toHaveLength(10)
    const nextDay = new Date(now.getTime() + 25 * 60 * 60 * 1000)
    expect(await claimVerificationAttempt(db, userId, nextDay)).toBe(true)
  })
})
