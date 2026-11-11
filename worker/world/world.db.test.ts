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
  othersBeforeRepeat,
  requestConversation,
  respondToRequest,
  restAfterConversationMs,
  sendMessage,
  speakingMs,
} from './conversations'
import { timeline, transcript } from './reads'
import type { World } from './events'
import { recordImpression } from './impressions'
import { messageAgent, messageOwner } from './owner-thread'
import { nudgeIdlePeople } from './people'
import { goTo, listPlaces, lookAround } from './travel'

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
  hobbies: ['chess', 'coffee', 'hiking'],
  looking_for: [],
  about_me: '',
  avoid: '',
  conversation_style: '',
  fun_facts: [],
  links: [],
  avatar: {
    gender: 'male',
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

  test('the same pair can talk again only after meeting enough other people', async () => {
    expect([3, 10, 15, 51, 500].map(othersBeforeRepeat)).toEqual([1, 2, 3, 10, 10])
    const [a, b, c] = [await person('A'), await person('B'), await person('C')]
    await talking(a, b)
    await run((w) => endConversation(w, a, 'Nice chat'), later(minutes(5)))
    const free = minutes(5) + restAfterConversationMs + 1000
    const again = await run((w) => requestConversation(w, b, a, 'Again?'), later(free))
    expect(again).toMatchObject({ ok: false, text: expect.stringContaining('Meet 1 more person') })
    await talking(a, c, later(free))
    await run((w) => endConversation(w, a, 'Nice too'), later(free + minutes(5)))
    const afterOthers = await run(
      (w) => requestConversation(w, a, b, 'Round two?'),
      later(free + minutes(5) + restAfterConversationMs + 1000),
    )
    expect(afterOthers.ok).toBe(true)
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
    const sent = await Promise.all([
      run((w) => sendMessage(w, a, 'from A'), later(1000)),
      run((w) => sendMessage(w, b, 'from B'), later(1001)),
    ])
    expect(sent.filter((outcome) => outcome.ok)).toHaveLength(1)
    expect(await db.select().from(messages)).toHaveLength(1)
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

describe('pace', () => {
  test('the requester is told to open and the accepter to wait', async () => {
    const [a, b] = [await person('Ada'), await person('Bob')]
    await run((w) => requestConversation(w, a, b, 'Hi there'))
    const [request] = await pendingFrom(a)
    const outcome = await run((w) => respondToRequest(w, b, request!.id, true))
    expect(JSON.parse(outcome.text).next).toContain('wait for their first message')
    const [started] = (await eventsOf(a)).filter((e) => e.event === 'conversation_started')
    expect(started!.next).toContain('say hello first')
    expect(started!.time).toMatch(/PT$/)
  })

  test('a message takes as long to land as it takes to say', async () => {
    const [a, b] = [await person('Ada'), await person('Bob')]
    const id = await talking(a, b)
    const text = "hey, I'm Ada. robots by day, chess by night. what about you?"
    const outcome = await run((w) => sendMessage(w, a, text))
    expect(outcome.ok).toBe(true)
    expect(outcome.dueAt).toBeUndefined()
    const spoken = later(speakingMs(text))
    const [delivery] = await db
      .select({ dueAt: deliveries.dueAt })
      .from(deliveries)
      .where(sql`${deliveries.personId} = ${b} and ${deliveries.text} like '[conversation]%'`)
    expect(delivery!.dueAt).toEqual(spoken)
    const before = await transcript(db, id, later(speakingMs(text) - 1000))
    expect(before!.messages).toHaveLength(0)
    expect(before!.typing).toBe(a)
    const after = await transcript(db, id, spoken)
    expect(after!.messages.map((m) => m.text)).toEqual([text])
    expect(after!.typing).toBeNull()
  })

  test('someone with no agent stands on the map but is never offered or asked', async () => {
    const [a, b, away] = [await person('Ada'), await person('Bob'), await person('Cy')]
    await db.update(people).set({ agentId: null }).where(eq(people.id, away))
    const look = JSON.parse((await run((w) => lookAround(w, a))).text)
    expect(look.people_here).toEqual([{ person_id: b, status: 'available', met_before: false }])
    const here = JSON.parse((await run((w) => listPlaces(w, a))).text).find(
      (place: { id: string }) => place.id === placeId,
    )
    expect(here).toMatchObject({
      occupancy: 2,
      free_spots: placesById.get(placeId)!.capacity - 3,
    })
    expect(await run((w) => requestConversation(w, a, away, 'hey'))).toMatchObject({
      ok: false,
      text: expect.stringContaining("isn't here"),
    })
    expect(await pendingFrom(a)).toHaveLength(0)
  })

  test('a request from someone whose agent has stopped cannot be accepted', async () => {
    const [a, b] = [await person('Ada'), await person('Bob')]
    await run((w) => requestConversation(w, a, b, 'hey'))
    const [request] = await pendingFrom(a)
    await db.update(people).set({ agentId: null }).where(eq(people.id, a))
    expect(await run((w) => respondToRequest(w, b, request!.id, true))).toMatchObject({
      ok: false,
      text: expect.stringContaining('expired'),
    })
    const [row] = await db
      .select({ conversationId: people.conversationId })
      .from(people)
      .where(eq(people.id, b))
    expect(row!.conversationId).toBeNull()
  })

  test('agents meet blind: look_around and requests carry ids, not names', async () => {
    const [a, b, c] = [await person('Ada'), await person('Bob'), await person('Cy')]
    await talking(a, b)
    await run((w) => endConversation(w, a, 'done'), later(minutes(1)))
    const free = later(minutes(1) + restAfterConversationMs + 1000)
    const look = JSON.parse((await run((w) => lookAround(w, a), free)).text)
    expect(look.people_here).toEqual(
      expect.arrayContaining([
        { person_id: b, status: 'available', met_before: true },
        { person_id: c, status: 'available', met_before: false },
      ]),
    )
    expect(JSON.stringify(look)).not.toContain('Bob')
    await run((w) => requestConversation(w, a, c, "hey, I'm Ada. what brings you here?"), free)
    const [request] = (await eventsOf(c)).filter((e) => e.event === 'conversation_request')
    expect(request).toMatchObject({ from_person_id: a, met_before: false })
    expect(JSON.stringify(request)).not.toContain("Ada's headline")
    expect(request!.from).toBeUndefined()
    await run(expireRequests, later(minutes(1) + restAfterConversationMs + minutes(6)))
    const [expired] = (await eventsOf(a)).filter((e) => e.event === 'request_expired')
    expect(expired).toMatchObject({ to_person_id: c })
    expect(JSON.stringify(expired)).not.toContain('Cy')
  })

  test('messages alternate, and nobody sends while one is still landing', async () => {
    const [a, b] = [await person('Ada'), await person('Bob')]
    await talking(a, b)
    expect((await run((w) => sendMessage(w, a, 'Hey!'))).ok).toBe(true)
    const landed = speakingMs('Hey!')
    expect((await run((w) => sendMessage(w, b, 'Hi!'), later(landed - 1))).text).toContain(
      'still landing',
    )
    expect((await run((w) => sendMessage(w, a, 'Still there?'), later(landed))).text).toContain(
      'their turn',
    )
    expect((await run((w) => sendMessage(w, b, 'Hi!'), later(landed))).ok).toBe(true)
    const both = landed + speakingMs('Hi!')
    expect((await run((w) => sendMessage(w, a, 'There you are.'), later(both))).ok).toBe(true)
    const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(messages)
    expect(count!.n).toBe(3)
  })

  test('after a conversation both people rest before the next', async () => {
    const [a, b, c] = [await person('Ada'), await person('Bob'), await person('Cy')]
    await talking(a, b)
    const ended = await run((w) => endConversation(w, a, 'done'))
    expect(JSON.parse(ended.text).next).toContain('break')
    const [event] = (await eventsOf(b)).filter((e) => e.event === 'conversation_ended')
    expect(event!.next).toContain('break')
    expect((await run((w) => requestConversation(w, c, a, 'Hi'))).text).toContain('taking a break')
    expect((await run((w) => requestConversation(w, b, c, 'Hi'))).text).toContain('on a break')
    const look = JSON.parse((await run((w) => lookAround(w, a))).text)
    expect(look.your_status).toBe('resting')
    expect(look.your_break_ends).toMatch(/PT$/)
    const soon = later(restAfterConversationMs - 1000)
    expect((await run((w) => requestConversation(w, c, a, 'Hi'), soon)).ok).toBe(false)
    const after = later(restAfterConversationMs + 1000)
    expect((await run((w) => requestConversation(w, c, a, 'Hi'), after)).ok).toBe(true)
    expect((await run((w) => goTo(w, b, 'arcade', 'bored'), soon)).ok).toBe(true)
  })
})

describe('owner messages', () => {
  test('an agent writes to its owner unprompted once every two hours, and answers any time', async () => {
    const a = await person('Ada')
    expect((await run((w) => messageOwner(w, a, 'Met someone great.'))).ok).toBe(true)
    const again = await run((w) => messageOwner(w, a, 'And another.'), later(minutes(30)))
    expect(again).toMatchObject({ ok: false, text: expect.stringContaining('write again after') })
    await run((w) => messageAgent(w, a, 'Who was it?'), later(minutes(31)))
    expect((await run((w) => messageOwner(w, a, 'Omar.'), later(minutes(32)))).ok).toBe(true)
    expect((await run((w) => messageOwner(w, a, 'Also…'), later(minutes(33)))).ok).toBe(false)
    expect((await run((w) => messageOwner(w, a, 'Later.'), later(minutes(153)))).ok).toBe(true)
  })

  test('the ration holds when calls race, and ties go by thread order', async () => {
    const a = await person('Ada')
    const raced = await Promise.all([
      run((w) => messageOwner(w, a, 'One.')),
      run((w) => messageOwner(w, a, 'Two.')),
    ])
    expect(raced.filter((outcome) => outcome.ok)).toHaveLength(1)
    await run((w) => messageAgent(w, a, 'Tell me more.'))
    expect((await run((w) => messageOwner(w, a, 'Sure.'))).ok).toBe(true)
  })
})

describe('timeline', () => {
  test('the world records what each person did, with the other person and a note', async () => {
    const [a, b] = [await person('Ada'), await person('Bob')]
    await run((w) => lookAround(w, a))
    await run((w) => requestConversation(w, a, b, "hey, I'm Ada"))
    const [request] = await pendingFrom(a)
    await run((w) => respondToRequest(w, b, request!.id, false, 'not today'))
    await run((w) => goTo(w, a, 'arcade', 'bored'), later(1000))
    const kinds = async (id: string) =>
      (
        await db
          .select({ kind: worldEvents.kind, note: worldEvents.note, otherId: worldEvents.otherId })
          .from(worldEvents)
          .where(eq(worldEvents.personId, id))
          .orderBy(worldEvents.id)
      ).map((row) => [row.kind, row.otherId, row.note])
    expect(await kinds(a)).toEqual([
      ['looked_around', null, null],
      ['asked', b, "hey, I'm Ada"],
      ['was_declined', b, 'not today'],
      ['departed', null, 'bored'],
      ['arrived', null, 'bored'],
    ])
    expect(await kinds(b)).toEqual([
      ['was_asked', a, "hey, I'm Ada"],
      ['declined', a, 'not today'],
    ])
    const [trip] = await db
      .select({ arrivesAt: people.arrivesAt })
      .from(people)
      .where(eq(people.id, a))
    const before = await timeline(db, a, later(2000))
    expect(before[0]).toMatchObject({ kind: 'departed', placeId: 'arcade', note: 'bored' })
    expect(before.some((event) => event.kind === 'arrived')).toBe(false)
    const after = await timeline(db, a, trip!.arrivesAt!)
    expect(after[0]).toMatchObject({ kind: 'arrived', placeId: 'arcade' })
  })
})

describe('travel', () => {
  test('a place rejects arrivals beyond its capacity, even when they race', async () => {
    const target = placesById.get('lands-end-lookout')!
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
    const [a, b] = [await person('A'), await person('B', 'lands-end-lookout')]
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
    await run((w) => goTo(w, b, 'lands-end-lookout', 'coffee'))
    expect(await pendingFrom(a)).toHaveLength(0)
    expect(await eventsOf(a)).toContainEqual(
      expect.objectContaining({ event: 'request_expired', why: 'they left for somewhere else' }),
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

  test('nobody is nudged during their break after a conversation', async () => {
    const [a, b] = [await person('A'), await person('B')]
    await talking(a, b)
    await run((w) => endConversation(w, a, 'done'), later(minutes(7)))
    await run(nudgeIdlePeople, later(minutes(7) + restAfterConversationMs - 1000))
    const nudged = async (id: string) =>
      (await eventsOf(id)).filter((event) => event.event === 'nudge').length
    expect(await nudged(a)).toBe(0)
    expect(await nudged(b)).toBe(0)
    await run(nudgeIdlePeople, later(minutes(7) + restAfterConversationMs))
    expect(await nudged(a)).toBe(1)
    expect(await nudged(b)).toBe(1)
  })
})
