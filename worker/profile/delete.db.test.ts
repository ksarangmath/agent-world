import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeEach, expect, test, vi } from 'vitest'
import * as schema from '../db/schema'
import type { Profile } from '../../shared/profile'
import { archiveAgent, deleteMemoryStore, ensureMemoryStore, launchAgent } from '../omnara/agents'
import { claimVerificationAttempt } from './builder'
import { deleteAccount } from './delete'
import { launchPerson } from './launch'

vi.mock('../omnara/agents', () => ({
  archiveAgent: vi.fn(),
  deleteMemoryStore: vi.fn(),
  ensureMemoryStore: vi.fn(),
  launchAgent: vi.fn(),
}))

const client = postgres('postgresql://postgres:postgres@127.0.0.1:54322/postgres', { max: 4 })
const db = drizzle(client, { schema, casing: 'snake_case' })
afterAll(() => client.end())

const { handledToolCalls, people, profileDrafts } = schema
const services = { db, omnara: {} as never }
const userId = '00000000-0000-4000-8000-0000000000dd'
const otherId = '00000000-0000-4000-8000-0000000000de'

const counts = async (id: string) => {
  const [row] = await db.execute<{ users: number; people: number; drafts: number; tries: number }>(
    sql`select
      (select count(*)::int from auth.users where id = ${id}) as users,
      (select count(*)::int from people where user_id = ${id}) as people,
      (select count(*)::int from profile_drafts where user_id = ${id}) as drafts,
      (select count(*)::int from verification_attempts where user_id = ${id}) as tries`,
  )
  return row
}

async function member(id: string, name: string) {
  await db.execute(sql`insert into auth.users (id) values (${id})`)
  await db.insert(people).values({
    userId: id,
    profile: { name } as never,
    agentId: `agent-${name}`,
    memoryStoreId: `store-${name}`,
  })
  await db.insert(profileDrafts).values({
    userId: id,
    runId: crypto.randomUUID(),
    linkedinUrl: 'https://www.linkedin.com/in/x',
  })
  await claimVerificationAttempt(db, id, new Date())
}

beforeEach(async () => {
  vi.mocked(archiveAgent).mockReset().mockResolvedValue(undefined)
  vi.mocked(deleteMemoryStore).mockReset().mockResolvedValue(undefined)
  vi.mocked(ensureMemoryStore).mockReset()
  vi.mocked(launchAgent).mockReset()
  await db.execute(sql`
    truncate people, conversations, conversation_requests, messages, impressions, owner_messages,
      handled_tool_calls, deliveries, world_events, profile_drafts, verification_attempts
      restart identity cascade`)
  await db.execute(sql`delete from auth.users where id in (${userId}, ${otherId})`)
})

test('deleting an account stops the agent and removes the sign-in, the person, and everything kept for them', async () => {
  await member(userId, 'Ada')
  await member(otherId, 'Bob')
  await deleteAccount(services, userId)
  expect(await counts(userId)).toEqual({ users: 0, people: 0, drafts: 0, tries: 0 })
  expect(await counts(otherId)).toEqual({ users: 1, people: 1, drafts: 1, tries: 1 })
  expect(vi.mocked(archiveAgent).mock.calls.map((call) => call[1])).toEqual(['agent-Ada'])
  expect(vi.mocked(deleteMemoryStore).mock.calls.map((call) => call[1])).toEqual(['store-Ada'])
})

test('nothing is deleted when the agent cannot be stopped', async () => {
  await member(userId, 'Ada')
  vi.mocked(archiveAgent).mockRejectedValue(new Error('Omnara is down'))
  await expect(deleteAccount(services, userId)).rejects.toThrow('Omnara is down')
  expect(await counts(userId)).toEqual({ users: 1, people: 1, drafts: 1, tries: 1 })
  expect(deleteMemoryStore).not.toHaveBeenCalled()
})

test('someone who signed in but never made an agent can delete their account too', async () => {
  await db.execute(sql`insert into auth.users (id) values (${userId})`)
  await claimVerificationAttempt(db, userId, new Date())
  await deleteAccount(services, userId)
  expect(await counts(userId)).toEqual({ users: 0, people: 0, drafts: 0, tries: 0 })
  expect(archiveAgent).not.toHaveBeenCalled()
  const [left] = await db.select({ n: sql<number>`count(*)::int` }).from(people)
  expect(left).toEqual({ n: 0 })
  expect(await db.select().from(people).where(eq(people.userId, userId))).toEqual([])
})

test('an agent attached while the account was being deleted is stopped too', async () => {
  await member(userId, 'Ada')
  vi.mocked(archiveAgent).mockImplementationOnce(async () => {
    await db.update(people).set({ agentId: 'agent-later' }).where(eq(people.userId, userId))
  })
  await deleteAccount(services, userId)
  expect(await counts(userId)).toEqual({ users: 0, people: 0, drafts: 0, tries: 0 })
  expect(vi.mocked(archiveAgent).mock.calls.map((call) => call[1])).toEqual([
    'agent-Ada',
    'agent-later',
  ])
})

test('an answer that does not say the agent is gone leaves the account alone', async () => {
  await member(userId, 'Ada')
  vi.mocked(archiveAgent).mockRejectedValue(
    Object.assign(new Error('bad request'), { status: 400 }),
  )
  await expect(deleteAccount(services, userId)).rejects.toThrow('bad request')
  expect(await counts(userId)).toEqual({ users: 1, people: 1, drafts: 1, tries: 1 })
})

test('what the agents had stored for their tool calls goes too, and nobody else’s', async () => {
  await member(userId, 'Ada')
  await member(otherId, 'Bob')
  await db
    .update(profileDrafts)
    .set({ builderAgentId: 'builder-Ada' })
    .where(eq(profileDrafts.userId, userId))
  await db.insert(handledToolCalls).values(
    ['agent-Ada', 'builder-Ada', 'agent-Bob'].map((agentId) => ({
      toolCallId: `call-${agentId}`,
      agentId,
      result: {},
    })),
  )
  await deleteAccount(services, userId)
  expect(await db.select({ agentId: handledToolCalls.agentId }).from(handledToolCalls)).toEqual([
    { agentId: 'agent-Bob' },
  ])
  expect(vi.mocked(archiveAgent).mock.calls.map((call) => call[1])).toEqual([
    'agent-Ada',
    'builder-Ada',
  ])
})

const profile: Profile = {
  name: 'Ada Lovelace',
  headline: 'Engineer',
  age: null,
  city: null,
  bio: 'Builds things.',
  current_work: '',
  expertise: [],
  interests: ['robotics'],
  hobbies: ['chess', 'coffee', 'hiking'],
  looking_for: ['Making new friends'],
  about_me: '',
  avoid: '',
  conversation_style: '',
  fun_facts: [],
  background: [],
  links: [],
  avatar: {
    gender: 'female',
    skin_tone: '#c68642',
    eye_color: 'brown',
    hair_color: '#2c1b10',
    hair_style: 'short',
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
const env = { OMNARA_WORLD_PROFILE_ID: 'world-profile' } as Env
const gone = async () => void (await db.delete(people).where(eq(people.userId, userId)))

test('a launch that finds its person deleted removes the memory store it made', async () => {
  await db.execute(sql`insert into auth.users (id) values (${userId})`)
  vi.mocked(ensureMemoryStore).mockImplementation(async () => {
    await gone()
    return 'store-new'
  })
  expect(await launchPerson(services, env, userId, profile, null)).toBeNull()
  expect(vi.mocked(deleteMemoryStore).mock.calls.map((call) => call[1])).toEqual(['store-new'])
  expect(launchAgent).not.toHaveBeenCalled()
})

test('a launch that finds its person deleted stops the agent it started', async () => {
  await db.execute(sql`insert into auth.users (id) values (${userId})`)
  vi.mocked(ensureMemoryStore).mockResolvedValue('store-new')
  vi.mocked(launchAgent).mockImplementation(async () => {
    await gone()
    return 'agent-new'
  })
  expect(await launchPerson(services, env, userId, profile, null)).toBeNull()
  expect(vi.mocked(archiveAgent).mock.calls.map((call) => call[1])).toEqual(['agent-new'])
})
