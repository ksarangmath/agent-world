import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, test } from 'vitest'
import { placesById } from '../../shared/map/places'
import { spots } from '../../shared/map/spots'
import type { Profile } from '../../shared/profile'
import * as schema from '../db/schema'
import {
  endConversation,
  endIfIdle,
  expireRequests,
  requestConversation,
  respondToRequest,
  sendMessage,
} from './conversations'
import type { World } from './events'
import { recordImpression } from './impressions'
import { nudgeIdlePeople } from './people'
import { goTo, lookAround } from './travel'

const client = postgres('postgresql://postgres:postgres@127.0.0.1:54322/postgres', { max: 12 })
const db = drizzle(client, { schema, casing: 'snake_case' })
afterAll(() => client.end())

const { people, conversations, conversationRequests, deliveries, messages, worldEvents } = schema
const t0 = new Date('2026-10-27T18:00:00Z')
const later = (ms: number) => new Date(t0.getTime() + ms)
const minutes = (n: number) => n * 60 * 1000

const run = <T>(fn: (world: World) => Promise<T>, now = t0) =>
  db.transaction((tx) => fn({ tx, now, deliveries: [] }))

const profile = (name: string): Profile => ({
  name,
  headline: `${name}'s headline`,
  age: null,
  city: null,
  bio: 'Test person.',
  current_work: '',
  expertise: [],
  interests: ['robotics', 'coffee'],
  looking_for: '',
  avoid: '',
  conversation_style: '',
  fun_facts: [],
  links: [],
  avatar: {
    skin_tone: '#c68642',
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
})

const placeId = 'dogpatch-robotics'
let nextSpot = 0

async function person(name: string, at: string | null = placeId): Promise<string> {
  const userId = crypto.randomUUID()
  await db.execute(sql`insert into auth.users (id) values (${userId})`)
  const spot = at ? spots(placesById.get(at)!)[nextSpot++]! : null
  const [row] = await db
    .insert(people)
    .values({
      userId,
      profile: profile(name),
      agentId: `agent-${name}`,
      placeId: at,
      tileX: spot?.x ?? null,
      tileY: spot?.y ?? null,
      lastActiveAt: t0,
    })
    .returning({ id: people.id })
  return row!.id
}

const pendingFrom = async (fromId: string) =>
  db
    .select()
    .from(conversationRequests)
    .where(
      sql`${conversationRequests.fromId} = ${fromId} and ${conversationRequests.status} = 'pending'`,
    )

const inboxOf = async (personId: string) =>
  (
    await db
      .select({ text: deliveries.text })
      .from(deliveries)
      .where(eq(deliveries.personId, personId))
  ).map((row) => row.text)

const eventsOf = async (personId: string) =>
  (await inboxOf(personId))
    .filter((text) => text.startsWith('[world] '))
    .map((text) => JSON.parse(text.slice('[world] '.length)) as Record<string, unknown>)

beforeEach(async () => {
  nextSpot = 0
  await db.execute(sql`
    truncate people, conversations, conversation_requests, messages, impressions, owner_messages,
      handled_tool_calls, deliveries, world_events restart identity cascade`)
  await db.execute(sql`delete from auth.users`)
})

async function talking(a: string, b: string, now = t0) {
  await run((w) => requestConversation(w, a, b, 'Hi there'), now)
  const [request] = await pendingFrom(a)
  const outcome = await run((w) => respondToRequest(w, b, request!.id, true), now)
  expect(outcome.ok).toBe(true)
  const [row] = await db.select({ id: people.conversationId }).from(people).where(eq(people.id, a))
  return row!.id!
}

describe('conversation requests', () => {
  test('two agents ask the same person at once, and only one can be accepted', async () => {
    const [a, b, c] = [await person('A'), await person('B'), await person('C')]
    const asked = await Promise.all([
      run((w) => requestConversation(w, a, c, 'Hello from A')),
      run((w) => requestConversation(w, b, c, 'Hello from B')),
    ])
    expect(asked.map((o) => o.ok)).toEqual([true, true])
    const [fromA, fromB] = [(await pendingFrom(a))[0]!, (await pendingFrom(b))[0]!]
    const answers = await Promise.all([
      run((w) => respondToRequest(w, c, fromA.id, true)),
      run((w) => respondToRequest(w, c, fromB.id, true)),
    ])
    expect(answers.filter((o) => o.ok)).toHaveLength(1)
    const active = await db.select().from(conversations)
    expect(active).toHaveLength(1)
    const statuses = await db
      .select({ status: conversationRequests.status })
      .from(conversationRequests)
    expect(statuses.map((s) => s.status).sort()).toEqual(['accepted', 'expired'])
  })

  test('asking someone in a conversation fails with busy', async () => {
    const [a, b, c] = [await person('A'), await person('B'), await person('C')]
    await talking(a, b)
    const outcome = await run((w) => requestConversation(w, c, a, 'Hi'))
    expect(outcome).toMatchObject({ ok: false, text: expect.stringContaining('busy') })
  })

  test('an agent can have only one pending outgoing request', async () => {
    const [a, b, c] = [await person('A'), await person('B'), await person('C')]
    expect((await run((w) => requestConversation(w, a, b, 'Hi B'))).ok).toBe(true)
    const second = await run((w) => requestConversation(w, a, c, 'Hi C'))
    expect(second).toMatchObject({ ok: false, text: expect.stringContaining('pending request') })
  })

  test('requests expire after 5 minutes and the requester hears about it', async () => {
    const [a, b] = [await person('A'), await person('B')]
    await run((w) => requestConversation(w, a, b, 'Hi'))
    const [request] = await pendingFrom(a)
    await run(expireRequests, later(minutes(4)))
    expect(await pendingFrom(a)).toHaveLength(1)
    await run(expireRequests, later(minutes(6)))
    expect(await pendingFrom(a)).toHaveLength(0)
    expect(await eventsOf(a)).toContainEqual(
      expect.objectContaining({ event: 'request_expired', why: 'no answer in time' }),
    )
    const late = await run((w) => respondToRequest(w, b, request!.id, true), later(minutes(6)))
    expect(late).toMatchObject({ ok: false, text: expect.stringContaining('expired') })
  })

  test('the same pair cannot talk again within 24 hours', async () => {
    const [a, b] = [await person('A'), await person('B')]
    await talking(a, b)
    await run((w) => endConversation(w, a, 'Nice chat'), later(minutes(5)))
    const again = await run((w) => requestConversation(w, b, a, 'Again?'), later(minutes(10)))
    expect(again).toMatchObject({ ok: false, text: expect.stringContaining('24 hours') })
    const nextDay = await run(
      (w) => requestConversation(w, b, a, 'Again?'),
      later(minutes(25 * 60)),
    )
    expect(nextDay.ok).toBe(true)
  })
})

describe('conversations', () => {
  test('messages are stored, delivered to the partner, and ending notifies the partner', async () => {
    const [a, b] = [await person('A'), await person('B')]
    await talking(a, b)
    expect((await run((w) => sendMessage(w, a, 'What are you building?'))).ok).toBe(true)
    const stored = await db.select({ text: messages.text }).from(messages)
    expect(stored).toEqual([{ text: 'What are you building?' }])
    const message = (await inboxOf(b)).find((text) => text.startsWith('[conversation] '))
    expect(JSON.parse(message!.slice('[conversation] '.length))).toEqual({
      from: 'A',
      person_id: a,
      text: 'What are you building?',
    })
    expect((await run((w) => endConversation(w, b, 'Good talk'))).ok).toBe(true)
    expect(await eventsOf(a)).toContainEqual(
      expect.objectContaining({
        event: 'conversation_ended',
        ended_by: 'them',
        reason: 'Good talk',
      }),
    )
    expect((await run((w) => sendMessage(w, a, 'Still there?'))).ok).toBe(false)
  })

  test('a conversation ends after 10 minutes without a message', async () => {
    const [a, b] = [await person('A'), await person('B')]
    const conversationId = await talking(a, b)
    await run((w) => sendMessage(w, a, 'Hello'), later(minutes(2)))
    await run((w) => endIfIdle(w, conversationId), later(minutes(11)))
    expect((await db.select().from(conversations))[0]!.endedAt).toBeNull()
    await run((w) => endIfIdle(w, conversationId), later(minutes(13)))
    const [ended] = await db.select().from(conversations)
    expect(ended!.endedAt).not.toBeNull()
    const both = await db.select({ c: people.conversationId }).from(people)
    expect(both.every((row) => row.c === null)).toBe(true)
    expect(await eventsOf(a)).toContainEqual(
      expect.objectContaining({ event: 'conversation_ended', ended_by: 'idle for 10 minutes' }),
    )
  })

  test('both partners can send at the same moment without a deadlock', async () => {
    const [a, b] = [await person('A'), await person('B')]
    await talking(a, b)
    const sent = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        run((w) => sendMessage(w, i % 2 ? a : b, `message ${i}`), later(1000 + i)),
      ),
    )
    expect(sent.every((outcome) => outcome.ok)).toBe(true)
    expect(await db.select().from(messages)).toHaveLength(6)
  })

  test('expiry racing an accept leaves the request either accepted or expired, never both', async () => {
    const [a, b] = [await person('A'), await person('B')]
    await run((w) => requestConversation(w, a, b, 'Hi'))
    const [request] = await pendingFrom(a)
    const at = new Date(request!.expiresAt.getTime() - 1)
    await Promise.all([
      run((w) => respondToRequest(w, b, request!.id, true), at),
      run(expireRequests, new Date(request!.expiresAt.getTime() + 1)),
    ])
    const [final] = await db
      .select({ status: conversationRequests.status })
      .from(conversationRequests)
    const started = await db.select().from(conversations)
    expect(final!.status === 'accepted').toBe(started.length === 1)
  })

  test('two matching impressions make one mutual match', async () => {
    const [a, b] = [await person('A'), await person('B')]
    await talking(a, b)
    await run((w) => endConversation(w, a))
    await Promise.all([
      run((w) => recordImpression(w, a, b, 'match', 'Building the same thing')),
      run((w) => recordImpression(w, b, a, 'match', 'Great robotics chat')),
    ])
    const matches = await db.select().from(worldEvents).where(eq(worldEvents.kind, 'mutual_match'))
    expect(matches).toHaveLength(2)
  })
})

describe('travel', () => {
  test('a place rejects arrivals beyond its capacity, even when they race', async () => {
    const target = placesById.get('chestnut-cafe')!
    const travelers = await Promise.all(
      Array.from({ length: target.capacity + 2 }, (_, i) => person(`T${i}`, null)),
    )
    const outcomes = await Promise.all(
      travelers.map((id) => run((w) => goTo(w, id, target.id, 'coffee'))),
    )
    expect(outcomes.filter((o) => o.ok)).toHaveLength(target.capacity)
    expect(outcomes.filter((o) => !o.ok).every((o) => o.text.includes('full'))).toBe(true)
  })

  test('a traveling agent holds its result until arrival and cannot be asked', async () => {
    const [a, b] = [await person('A'), await person('B', 'chestnut-cafe')]
    const trip = await run((w) => goTo(w, b, placeId, 'robots'))
    expect(trip.ok).toBe(true)
    expect(trip.dueAt!.getTime()).toBeGreaterThan(t0.getTime())
    const whileTraveling = await run((w) => requestConversation(w, a, b, 'Hi'))
    expect(whileTraveling).toMatchObject({ ok: false, text: expect.stringContaining("isn't here") })
    expect((await run((w) => lookAround(w, b))).text).toContain('on your way')
    const arrived = await run(
      (w) => requestConversation(w, a, b, 'Hi'),
      new Date(trip.dueAt!.getTime() + 1),
    )
    expect(arrived.ok).toBe(true)
  })

  test('leaving a place expires requests and tells whoever was waiting', async () => {
    const [a, b] = [await person('A'), await person('B')]
    await run((w) => requestConversation(w, a, b, 'Hi'))
    await run((w) => goTo(w, b, 'chestnut-cafe', 'coffee'))
    expect(await pendingFrom(a)).toHaveLength(0)
    expect(await eventsOf(a)).toContainEqual(
      expect.objectContaining({ event: 'request_expired', why: 'B left' }),
    )
  })
})

describe('nudges', () => {
  test('only free agents idle for 15 minutes get one nudge during waking hours', async () => {
    const [a, b, c] = [await person('A'), await person('B'), await person('C')]
    await talking(b, c)
    await run(nudgeIdlePeople, later(minutes(10)))
    expect(await inboxOf(a)).toHaveLength(0)
    await run(nudgeIdlePeople, later(minutes(16)))
    await run(nudgeIdlePeople, later(minutes(20)))
    const nudges = (await eventsOf(a)).filter((event) => event.event === 'nudge')
    expect(nudges).toHaveLength(1)
    expect((await eventsOf(b)).some((event) => event.event === 'nudge')).toBe(false)
    await run(nudgeIdlePeople, new Date('2026-10-27T09:00:00Z'))
    expect((await eventsOf(a)).filter((event) => event.event === 'nudge')).toHaveLength(1)
  })
})
