import { and, desc, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { placesById } from '../../shared/map/places'
import type { Database } from '../db/client'
import { conversationRequests, conversations, deliveries, messages, people } from '../db/schema'
import { deliver, done, record, refuse, worldEvent, type Outcome, type World } from './events'
import { isAt, lockPeople, statusOf, type Person } from './people'

export const requestLifetimeMs = 5 * 60 * 1000
export const repeatPairingWindowMs = 24 * 60 * 60 * 1000
export const idleConversationMs = 10 * 60 * 1000

const ordered = (a: string, b: string) => (a < b ? [a, b] : [b, a]) as [string, string]

const card = (person: Person) => ({
  person_id: person.id,
  name: person.profile.name,
  headline: person.profile.headline,
})

const afterConversation = 'Update your memory file for them, then call record_impression.'

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

export async function requestConversation(
  world: World,
  meId: string,
  personId: string,
  opener: string,
): Promise<Outcome> {
  const { tx, now } = world
  if (personId === meId) return refuse("You can't ask yourself for a conversation.")
  const locked = await lockPeople(world, [meId, personId])
  const me = locked.get(meId)!
  const them = locked.get(personId)
  if (!them) return refuse('There is no person with that id. Use look_around to see who is here.')
  const myStatus = statusOf(me, now)
  if (myStatus === 'in_conversation')
    return refuse("You're busy: you're already in a conversation.")
  if (myStatus === 'traveling') return refuse("You're still on your way somewhere.")
  if (!me.placeId || !isAt(them, me.placeId, now)) return refuse("That person isn't here.")
  if (statusOf(them, now) === 'in_conversation') {
    return refuse('That person is busy in another conversation.')
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
  const [recent] = await tx
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.personA, a),
        eq(conversations.personB, b),
        gt(conversations.startedAt, new Date(now.getTime() - repeatPairingWindowMs)),
      ),
    )
    .limit(1)
  if (recent) return refuse('You talked with that person in the last 24 hours. Meet someone new.')

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
  await deliver(
    world,
    personId,
    worldEvent('conversation_request', {
      request_id: request!.id,
      from: card(me),
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
    await deliver(
      world,
      them.id,
      worldEvent('request_declined', {
        request_id: requestId,
        by: card(me),
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

  const [a, b] = ordered(me.id, them.id)
  const [conversation] = await tx
    .insert(conversations)
    .values({ personA: a, personB: b, placeId: me.placeId, startedAt: now, lastMessageAt: now })
    .returning({ id: conversations.id })
  await close('accepted')
  await tx
    .update(people)
    .set({ conversationId: conversation!.id })
    .where(inArray(people.id, [a, b]))
  await expirePendingRequests(world, [a, b], 'they started another conversation')
  const place = placesById.get(me.placeId)!
  const next =
    'Talk with send_message, and end it with end_conversation when it has run its course.'
  await deliver(
    world,
    them.id,
    worldEvent('conversation_started', { with: card(me), place: place.name, next }),
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
  return done(JSON.stringify({ conversation_started_with: card(them), next }))
}

export async function sendMessage(world: World, meId: string, text: string): Promise<Outcome> {
  const { tx, now } = world
  const me = (await lockPeople(world, [meId])).get(meId)!
  if (!me.conversationId) return refuse("You're not in a conversation.")
  const [conversation] = await tx
    .select({ personA: conversations.personA, personB: conversations.personB })
    .from(conversations)
    .where(eq(conversations.id, me.conversationId))
  const partnerId = conversation!.personA === meId ? conversation!.personB : conversation!.personA
  await tx
    .insert(messages)
    .values({ conversationId: me.conversationId, senderId: meId, text, createdAt: now })
  await tx
    .update(conversations)
    .set({ lastMessageAt: sql`greatest(${conversations.lastMessageAt}, ${now.toISOString()})` })
    .where(eq(conversations.id, me.conversationId))
  await deliver(
    world,
    partnerId,
    `[conversation] ${JSON.stringify({ from: me.profile.name, person_id: meId, text })}`,
    { actor: meId },
  )
  return done('Delivered.')
}

async function finish(
  world: World,
  conversationId: string,
  pair: [Person, Person],
  endedBy: string | null,
  reason: string | null,
) {
  const { tx, now } = world
  await tx
    .update(conversations)
    .set({ endedAt: now, endedBy, endReason: reason })
    .where(eq(conversations.id, conversationId))
  await tx
    .update(people)
    .set({ conversationId: null })
    .where(
      inArray(
        people.id,
        pair.map((person) => person.id),
      ),
    )
  const [first, second] = pair
  for (const [person, other] of [
    [first, second],
    [second, first],
  ] as const) {
    await record(world, person.id, 'conversation_ended', now, {
      placeId: person.placeId ?? undefined,
      otherId: other.id,
    })
    if (person.id === endedBy) continue
    await deliver(
      world,
      person.id,
      worldEvent('conversation_ended', {
        with: card(other),
        ended_by: endedBy === null ? 'idle for 10 minutes' : 'them',
        reason,
        next: afterConversation,
      }),
    )
  }
}

export async function endConversation(
  world: World,
  meId: string,
  reason?: string,
): Promise<Outcome> {
  const { tx } = world
  const [row] = await tx
    .select({
      personA: conversations.personA,
      personB: conversations.personB,
      id: conversations.id,
    })
    .from(people)
    .innerJoin(conversations, eq(people.conversationId, conversations.id))
    .where(eq(people.id, meId))
  if (!row) return refuse("You're not in a conversation.")
  const locked = await lockPeople(world, [row.personA, row.personB])
  if (locked.get(meId)?.conversationId !== row.id) return refuse("You're not in a conversation.")
  const partner = locked.get(row.personA === meId ? row.personB : row.personA)!
  await finish(world, row.id, [locked.get(meId)!, partner], meId, reason ?? null)
  return done(
    JSON.stringify({ ended: true, next: afterConversation, record_impression_for: card(partner) }),
  )
}

const targets = alias(people, 'targets')

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
  const names = new Map(
    (
      await tx
        .select({ id: targets.id, profile: targets.profile })
        .from(targets)
        .where(
          inArray(
            targets.id,
            expired.map((request) => request.toId),
          ),
        )
    ).map((row) => [row.id, row.profile.name]),
  )
  await notifyAll(
    world,
    expired.map((request) => ({
      to: request.fromId,
      text: worldEvent('request_expired', {
        request_id: request.id,
        to: names.get(request.toId) ?? null,
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
        lte(conversations.lastMessageAt, new Date(now.getTime() - idleConversationMs)),
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
    .select({ endedAt: conversations.endedAt, lastMessageAt: conversations.lastMessageAt })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
  if (current!.endedAt || current!.lastMessageAt.getTime() > now.getTime() - idleConversationMs) {
    return
  }
  await finish(
    world,
    conversationId,
    [locked.get(conversation.personA)!, locked.get(conversation.personB)!],
    null,
    null,
  )
}
