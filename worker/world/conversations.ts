import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from 'drizzle-orm'
import { placesById } from '../../shared/map/places'
import type { Database } from '../db/client'
import { conversationRequests, conversations, deliveries, messages, people } from '../db/schema'
import {
  clockTime,
  deliver,
  done,
  record,
  refuse,
  worldEvent,
  type Outcome,
  type World,
} from './events'
import { asleep, isAt, lockPeople, startOfDay, statusOf, type Person } from './people'

export const requestLifetimeMs = 5 * 60 * 1000
export const othersBeforeRepeat = (population: number) =>
  Math.min(Math.max(1, Math.min(10, Math.floor(population / 5))), Math.max(0, population - 2))
export const pairGapMs = 60 * 60 * 1000
export const idleConversationMs = 10 * 60 * 1000
export const goodbyeWaitMs = 2 * 60 * 1000
export const wrapUpAfter = 16
export const messagesPerConversation = 20
export const restAfterConversationMs = 5 * 60 * 1000
export const conversationsPerWindow = 3
export const conversationWindowMs = 45 * 60 * 1000
export const conversationsPerDay = 100
export const speakingMs = (text: string) => Math.min(20_000, 1_500 + text.length * 55)

const ordered = (a: string, b: string) => (a < b ? [a, b] : [b, a]) as [string, string]

const involving = (personId: string) =>
  or(eq(conversations.personA, personId), eq(conversations.personB, personId))

async function hasTalkedThisVisit({ tx }: World, person: Person) {
  const [last] = await tx
    .select({ endedAt: conversations.endedAt })
    .from(conversations)
    .where(involving(person.id))
    .orderBy(desc(conversations.startedAt))
    .limit(1)
  return Boolean(last?.endedAt && (!person.departedAt || person.departedAt < last.endedAt))
}

async function breakAfter({ tx, now }: World, personId: string) {
  const recent = await tx
    .select({ startedAt: conversations.startedAt })
    .from(conversations)
    .where(
      and(
        involving(personId),
        gt(conversations.startedAt, new Date(now.getTime() - conversationWindowMs)),
      ),
    )
    .orderBy(desc(conversations.startedAt))
    .limit(conversationsPerWindow)
  const windowOpens =
    recent.length === conversationsPerWindow
      ? recent.at(-1)!.startedAt.getTime() + conversationWindowMs
      : 0
  return new Date(Math.max(now.getTime() + restAfterConversationMs, windowOpens))
}

async function talkedToday({ tx, now }: World, personId: string) {
  const [today] = await tx
    .select({ n: count() })
    .from(conversations)
    .where(and(involving(personId), gte(conversations.startedAt, startOfDay(now))))
  return today!.n
}

const afterConversation = (restingUntil: Date) =>
  `The conversation is over, so no more messages to them. Update your memory file for them, then call record_impression. You're on a break from conversations until ${clockTime(restingUntil)}. It's one conversation per visit, so head somewhere else now: a place for something you like doing.`

async function notifyAll(world: World, items: { to: string; text: string }[]) {
  if (items.length === 0) return
  const rows = await world.tx
    .insert(deliveries)
    .values(items.map((item) => ({ personId: item.to, text: item.text, mode: 'queued' as const })))
    .returning({ id: deliveries.id })
  world.deliveries.push(...rows.map((row) => row.id))
}

export async function expirePendingRequests(world: World, personIds: string[], why: string) {
  const expired = await world.tx
    .update(conversationRequests)
    .set({ status: 'expired', respondedAt: world.now })
    .where(
      and(
        eq(conversationRequests.status, 'pending'),
        or(
          inArray(conversationRequests.fromId, personIds),
          inArray(conversationRequests.toId, personIds),
        ),
      ),
    )
    .returning({ id: conversationRequests.id, fromId: conversationRequests.fromId })
  await notifyAll(
    world,
    expired
      .filter((request) => !personIds.includes(request.fromId))
      .map((request) => ({
        to: request.fromId,
        text: worldEvent('request_expired', { request_id: request.id, why }),
      })),
  )
}

const typeset = /[—–;]|--| - /

const retype = () =>
  refuse(
    'Nobody texts with dashes or semicolons. Say it again in plain words, with periods and commas.',
  )

export async function requestConversation(
  world: World,
  meId: string,
  personId: string,
  opener: string,
): Promise<Outcome> {
  const { tx, now } = world
  if (personId === meId) return refuse("You can't ask yourself for a conversation.")
  if (typeset.test(opener)) return retype()
  const locked = await lockPeople(world, [meId, personId])
  const me = locked.get(meId)!
  const them = locked.get(personId)
  if (!them) return refuse('There is no person with that id. Use look_around to see who is here.')
  const myStatus = statusOf(me, now)
  if (myStatus === 'in_conversation')
    return refuse("You're busy: you're already in a conversation.")
  if (myStatus === 'traveling') return refuse("You're still on your way somewhere.")
  if (myStatus === 'asleep') return asleep
  if (myStatus === 'resting') {
    return refuse(
      `You're on a break from conversations until ${clockTime(me.restingUntil!)}. Update your notes, look around, or go somewhere new, and ask again after.`,
    )
  }
  if (!me.placeId || !isAt(them, me.placeId, now)) return refuse("That person isn't here.")
  if (statusOf(them, now) === 'asleep') return refuse('That person is asleep.')
  if (statusOf(them, now) === 'in_conversation') {
    return refuse('That person is busy in another conversation.')
  }
  if (statusOf(them, now) === 'resting') {
    return refuse(
      'That person just finished a conversation and is taking a break. Ask someone else.',
    )
  }
  if (await hasTalkedThisVisit(world, me)) {
    return refuse(
      "You've already had a conversation on this visit. Go do something you like somewhere else, then meet people there.",
    )
  }
  if (await hasTalkedThisVisit(world, them)) {
    return refuse(
      'That person has already had a conversation on this visit and is about to head off. Ask someone else.',
    )
  }

  if ((await talkedToday(world, meId)) >= conversationsPerDay) {
    return refuse(
      `You've had ${conversationsPerDay} conversations today, which is the limit. No more until tomorrow; you can still look around and visit places.`,
    )
  }
  if ((await talkedToday(world, personId)) >= conversationsPerDay) {
    return refuse('That person has had a full day of conversations. Ask someone else.')
  }

  await tx
    .update(conversationRequests)
    .set({ status: 'expired', respondedAt: now })
    .where(
      and(
        eq(conversationRequests.status, 'pending'),
        eq(conversationRequests.fromId, meId),
        lte(conversationRequests.expiresAt, now),
      ),
    )
  const open = await tx
    .select({ id: conversationRequests.id, fromId: conversationRequests.fromId })
    .from(conversationRequests)
    .where(
      and(
        eq(conversationRequests.status, 'pending'),
        or(
          eq(conversationRequests.fromId, meId),
          and(eq(conversationRequests.fromId, personId), eq(conversationRequests.toId, meId)),
        ),
      ),
    )
  if (open.some((request) => request.fromId === meId)) {
    return refuse('You already have a pending request. Wait for the answer, or for it to expire.')
  }
  const theirs = open.find((request) => request.fromId === personId)
  if (theirs) {
    return refuse(
      `That person already asked you. Answer with respond_to_request (request_id ${theirs.id}).`,
    )
  }

  const [a, b] = ordered(meId, personId)
  const [last] = await tx
    .select({ startedAt: conversations.startedAt })
    .from(conversations)
    .where(and(eq(conversations.personA, a), eq(conversations.personB, b)))
    .orderBy(desc(conversations.startedAt))
    .limit(1)
  if (last) {
    const [population] = await tx
      .select({ n: count() })
      .from(people)
      .where(and(isNotNull(people.agentId), gt(people.awakeUntil, world.now)))
    const needed = othersBeforeRepeat(population!.n)
    const [since] = await tx
      .select({
        met: countDistinct(
          sql`case when ${conversations.personA} = ${meId} then ${conversations.personB} else ${conversations.personA} end`,
        ),
      })
      .from(conversations)
      .where(
        and(
          or(eq(conversations.personA, meId), eq(conversations.personB, meId)),
          gt(conversations.startedAt, last.startedAt),
        ),
      )
    const more = needed - since!.met
    if (more > 0) {
      return refuse(
        `You've already talked with them. Meet ${more} more ${more === 1 ? 'person' : 'people'} before asking them again.`,
      )
    }
    const catchUpAt = new Date(last.startedAt.getTime() + pairGapMs)
    if (catchUpAt > now) {
      return refuse(`You two talked not long ago. You can catch up after ${clockTime(catchUpAt)}.`)
    }
  }

  const [request] = await tx
    .insert(conversationRequests)
    .values({
      fromId: meId,
      toId: personId,
      placeId: me.placeId,
      opener,
      expiresAt: new Date(now.getTime() + requestLifetimeMs),
      createdAt: now,
    })
    .returning({ id: conversationRequests.id })
  await record(world, meId, 'asked', now, { placeId: me.placeId, otherId: personId, note: opener })
  await record(world, personId, 'was_asked', now, {
    placeId: me.placeId,
    otherId: meId,
    note: opener,
  })
  await deliver(
    world,
    personId,
    worldEvent('conversation_request', {
      request_id: request!.id,
      from_person_id: me.id,
      met_before: last !== undefined,
      opener,
      expires_in_minutes: 5,
      answer_with: 'respond_to_request',
    }),
  )
  return done('Request sent. It expires in 5 minutes, and the answer arrives as a [world] event.')
}

export async function respondToRequest(
  world: World,
  meId: string,
  requestId: string,
  accept: boolean,
  reason?: string,
): Promise<Outcome> {
  const { tx, now } = world
  const [found] = await tx
    .select({ fromId: conversationRequests.fromId })
    .from(conversationRequests)
    .where(and(eq(conversationRequests.id, requestId), eq(conversationRequests.toId, meId)))
  if (!found) return refuse('There is no request with that id for you.')
  const locked = await lockPeople(world, [meId, found.fromId])
  const [request] = await tx
    .select()
    .from(conversationRequests)
    .where(eq(conversationRequests.id, requestId))
    .for('no key update')
  const me = locked.get(meId)!
  const them = locked.get(found.fromId)!
  if (request!.status !== 'pending') return refuse(`That request is already ${request!.status}.`)

  const close = async (status: 'declined' | 'expired' | 'accepted') =>
    tx
      .update(conversationRequests)
      .set({ status, respondedAt: now })
      .where(eq(conversationRequests.id, requestId))
  const expire = async (why: string) => {
    await close('expired')
    await deliver(world, them.id, worldEvent('request_expired', { request_id: requestId, why }))
  }

  if (request!.expiresAt <= now) {
    await expire('no answer in time')
    return refuse('That request has expired.')
  }
  if (!accept) {
    await close('declined')
    await record(world, me.id, 'declined', now, { otherId: them.id, note: reason })
    await record(world, them.id, 'was_declined', now, { otherId: me.id, note: reason })
    await deliver(
      world,
      them.id,
      worldEvent('request_declined', {
        request_id: requestId,
        by_person_id: me.id,
        reason: reason ?? null,
      }),
    )
    return done('Declined.')
  }
  const free = (person: Person) => statusOf(person, now) === 'available'
  if (!free(me) || !free(them) || !me.placeId || !isAt(them, me.placeId, now)) {
    await expire('you are no longer both free in the same place')
    return refuse('That request has expired: one of you is no longer free in the same place.')
  }
  for (const person of [me, them]) {
    if ((await talkedToday(world, person.id)) < conversationsPerDay) continue
    await expire('one of you has had a full day of conversations')
    return refuse('That request has expired: one of you has had a full day of conversations.')
  }

  const [a, b] = ordered(me.id, them.id)
  const [conversation] = await tx
    .insert(conversations)
    .values({ personA: a, personB: b, placeId: me.placeId, startedAt: now, lastMessageAt: now })
    .returning({ id: conversations.id })
  await close('accepted')
  await record(world, me.id, 'accepted', now, { otherId: them.id })
  await tx
    .update(people)
    .set({ conversationId: conversation!.id })
    .where(inArray(people.id, [a, b]))
  await expirePendingRequests(world, [a, b], 'they started another conversation')
  const place = placesById.get(me.placeId)!
  const ending = 'End it with end_conversation when it has run its course.'
  await deliver(
    world,
    them.id,
    worldEvent('conversation_started', {
      with_person_id: me.id,
      place: place.name,
      time: clockTime(now),
      next: `You asked, so say hello first with send_message. ${ending}`,
    }),
  )
  for (const [person, other] of [
    [me, them],
    [them, me],
  ] as const) {
    await record(world, person.id, 'conversation_started', now, {
      placeId: place.id,
      otherId: other.id,
    })
  }
  return done(
    JSON.stringify({
      conversation_started_with: them.id,
      place: place.name,
      time: clockTime(now),
      next: `They asked, so wait for their first message, then reply with send_message. ${ending}`,
    }),
  )
}

const alreadyLeft = () => refuse('You already said goodbye. Wait for their last message.')
const stillLanding = () => refuse('Hold on: the last message is still landing. Wait for it.')

async function myConversation(world: World, meId: string) {
  const { tx } = world
  const [row] = await tx
    .select({
      id: conversations.id,
      personA: conversations.personA,
      personB: conversations.personB,
    })
    .from(people)
    .innerJoin(conversations, eq(people.conversationId, conversations.id))
    .where(eq(people.id, meId))
  if (!row) return null
  const locked = await lockPeople(world, [row.personA, row.personB])
  const me = locked.get(meId)!
  if (me.conversationId !== row.id) return null
  const [state] = await tx
    .select({ leaving: conversations.endedBy, reason: conversations.endReason })
    .from(conversations)
    .where(eq(conversations.id, row.id))
  const [last] = await tx
    .select({ senderId: messages.senderId, visibleAt: messages.visibleAt })
    .from(messages)
    .where(eq(messages.conversationId, row.id))
    .orderBy(desc(messages.id))
    .limit(1)
  return {
    id: row.id,
    me,
    partner: locked.get(row.personA === meId ? row.personB : row.personA)!,
    last,
    ...state!,
  }
}

type Talk = NonNullable<Awaited<ReturnType<typeof myConversation>>>

async function say(world: World, talk: Talk, text: string, note: object = {}) {
  const { tx, now } = world
  const from = Math.max(now.getTime(), talk.last?.visibleAt.getTime() ?? 0)
  const visibleAt = new Date(from + speakingMs(text))
  await tx.insert(messages).values({
    conversationId: talk.id,
    senderId: talk.me.id,
    text,
    createdAt: now,
    visibleAt,
  })
  await tx
    .update(conversations)
    .set({ lastMessageAt: sql`greatest(${conversations.lastMessageAt}, ${now.toISOString()})` })
    .where(eq(conversations.id, talk.id))
  await deliver(
    world,
    talk.partner.id,
    `[conversation] ${JSON.stringify({ person_id: talk.me.id, text, ...note })}`,
    { actor: talk.me.id, dueAt: visibleAt },
  )
  return visibleAt
}

async function lastWord(world: World, talk: Talk, text: string) {
  const heardAt = await say(world, talk, text)
  const restingUntil = await finish(world, talk.id, [talk.me, talk.partner], {
    endedBy: talk.leaving,
    reason: talk.reason,
    actor: talk.me.id,
    heardAt,
  })
  return done(
    JSON.stringify({
      ended: true,
      next: afterConversation(restingUntil),
      record_impression_for: talk.partner.id,
    }),
  )
}

export async function sendMessage(world: World, meId: string, text: string): Promise<Outcome> {
  if (typeset.test(text)) return retype()
  const talk = await myConversation(world, meId)
  if (!talk) return refuse("You're not in a conversation.")
  if (talk.leaving === meId) return alreadyLeft()
  if (talk.last && talk.last.visibleAt > world.now) return stillLanding()
  if (talk.last?.senderId === meId) {
    return refuse("You just sent a message. Wait for their reply; it's their turn.")
  }
  if (talk.leaving) return lastWord(world, talk, text)
  const [sent] = await world.tx
    .select({ n: count() })
    .from(messages)
    .where(eq(messages.conversationId, talk.id))
  if (sent!.n >= messagesPerConversation) {
    return refuse('This conversation has run its course. Say goodbye with end_conversation.')
  }
  if (sent!.n + 1 < wrapUpAfter) {
    await say(world, talk, text)
    return done(
      'Sent. It takes a moment to say out loud. Stop here: their reply reaches you once you stop.',
    )
  }
  await say(world, talk, text, {
    next: 'This has run long enough. Say goodbye with end_conversation, and name the plan if you made one.',
  })
  return done('Sent. Time to wrap up: when they answer, say goodbye with end_conversation.')
}

async function finish(
  world: World,
  conversationId: string,
  pair: [Person, Person],
  how: { endedBy: string | null; reason: string | null; actor?: string; heardAt?: Date },
) {
  const { tx, now } = world
  await tx
    .update(conversations)
    .set({ endedAt: now, endedBy: how.endedBy, endReason: how.reason })
    .where(eq(conversations.id, conversationId))
  const [first, second] = pair
  const restingUntil = new Map<string, Date>()
  for (const person of pair) {
    const until = await breakAfter(world, person.id)
    restingUntil.set(person.id, until)
    await tx
      .update(people)
      .set({ conversationId: null, restingUntil: until })
      .where(eq(people.id, person.id))
  }
  for (const [person, other] of [
    [first, second],
    [second, first],
  ] as const) {
    await record(world, person.id, 'conversation_ended', now, {
      placeId: person.placeId ?? undefined,
      otherId: other.id,
    })
    if (person.id === how.actor) continue
    const endedBy =
      how.endedBy === null
        ? `idle for ${idleConversationMs / 60_000} minutes`
        : how.endedBy === person.id
          ? 'you'
          : 'them'
    await deliver(
      world,
      person.id,
      worldEvent('conversation_ended', {
        with_person_id: other.id,
        ended_by: endedBy,
        reason: how.reason,
        time: clockTime(now),
        next: afterConversation(restingUntil.get(person.id)!),
      }),
      { dueAt: how.heardAt },
    )
  }
  return restingUntil.get(how.actor ?? first.id)!
}

export async function endConversation(
  world: World,
  meId: string,
  goodbye: string,
  reason?: string,
): Promise<Outcome> {
  if (typeset.test(goodbye)) return retype()
  const talk = await myConversation(world, meId)
  if (!talk) return refuse("You're not in a conversation.")
  if (talk.leaving === meId) return alreadyLeft()
  if (talk.last && talk.last.visibleAt > world.now) return stillLanding()
  if (talk.leaving) return lastWord(world, talk, goodbye)
  await say(world, talk, goodbye, {
    goodbye: true,
    next: "They're leaving. Send one last message to say bye, and confirm the plan if you made one. That ends the conversation.",
  })
  await world.tx
    .update(conversations)
    .set({ endedBy: meId, endReason: reason ?? null })
    .where(eq(conversations.id, talk.id))
  return done(
    JSON.stringify({
      said: true,
      next: 'They get one last message back. Wait for it: the world tells you when the conversation is over.',
    }),
  )
}

export async function expireRequests(world: World) {
  const { tx, now } = world
  const expired = await tx
    .update(conversationRequests)
    .set({ status: 'expired', respondedAt: now })
    .where(
      and(eq(conversationRequests.status, 'pending'), lte(conversationRequests.expiresAt, now)),
    )
    .returning({
      id: conversationRequests.id,
      fromId: conversationRequests.fromId,
      toId: conversationRequests.toId,
    })
  if (expired.length === 0) return
  for (const request of expired) {
    await record(world, request.fromId, 'request_expired', now, { otherId: request.toId })
  }
  await notifyAll(
    world,
    expired.map((request) => ({
      to: request.fromId,
      text: worldEvent('request_expired', {
        request_id: request.id,
        to_person_id: request.toId,
        why: 'no answer in time',
      }),
    })),
  )
}

export async function idleConversations(db: Database, now: Date) {
  const rows = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        isNull(conversations.endedAt),
        or(
          lte(conversations.lastMessageAt, new Date(now.getTime() - idleConversationMs)),
          and(
            isNotNull(conversations.endedBy),
            lte(conversations.lastMessageAt, new Date(now.getTime() - goodbyeWaitMs)),
          ),
        ),
      ),
    )
    .orderBy(desc(conversations.lastMessageAt))
  return rows.map((row) => row.id)
}

export async function endIfIdle(world: World, conversationId: string) {
  const { tx, now } = world
  const [conversation] = await tx
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
  if (!conversation || conversation.endedAt) return
  const locked = await lockPeople(world, [conversation.personA, conversation.personB])
  const [current] = await tx
    .select({
      endedAt: conversations.endedAt,
      lastMessageAt: conversations.lastMessageAt,
      leaving: conversations.endedBy,
      reason: conversations.endReason,
    })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
  const patience = current!.leaving ? goodbyeWaitMs : idleConversationMs
  if (current!.endedAt || current!.lastMessageAt.getTime() > now.getTime() - patience) return
  await finish(
    world,
    conversationId,
    [locked.get(conversation.personA)!, locked.get(conversation.personB)!],
    { endedBy: current!.leaving, reason: current!.reason },
  )
}
