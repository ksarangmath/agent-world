import { and, asc, desc, eq, inArray, lte, or, sql } from 'drizzle-orm'
import type {
  Matches,
  MyConversation,
  PersonCard,
  ThreadMessage,
  TimelineEvent,
  Transcript,
} from '../../shared/api'
import { alias } from 'drizzle-orm/pg-core'
import type { Database, Transaction } from '../db/client'
import {
  conversations,
  impressions,
  messages,
  ownerMessages,
  people,
  worldEvents,
} from '../db/schema'

export async function transcript(
  db: Database,
  conversationId: string,
  now = new Date(),
): Promise<Transcript | null> {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
  if (!conversation) return null
  const pair = await db
    .select({
      id: people.id,
      profile: people.profile,
      portrait: sql<boolean>`${people.portrait} is not null`,
    })
    .from(people)
    .where(inArray(people.id, [conversation.personA, conversation.personB]))
    .orderBy(asc(people.id))
  const lines = await db
    .select({
      senderId: messages.senderId,
      text: messages.text,
      at: messages.createdAt,
      visibleAt: messages.visibleAt,
    })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.id))
  const last = lines.at(-1)
  const next =
    last && conversation.endedAt === null
      ? pair.find((person) => person.id !== last.senderId)?.id
      : undefined
  return {
    id: conversation.id,
    placeId: conversation.placeId,
    people: pair.map((p) => ({
      id: p.id,
      name: p.profile.name,
      headline: p.profile.headline,
      portrait: p.portrait,
    })),
    endedAt: conversation.endedAt?.toISOString() ?? null,
    messages: lines
      .filter((line) => line.visibleAt <= now)
      .map((line) => ({ senderId: line.senderId, text: line.text, at: line.at.toISOString() })),
    typing: lines.find((line) => line.visibleAt > now)?.senderId ?? next ?? null,
  }
}

async function facesOf(db: Database | Transaction, ids: string[]) {
  if (ids.length === 0)
    return new Map<string, { name: string; headline: string; portrait: boolean }>()
  const rows = await db
    .select({
      id: people.id,
      name: sql<string>`${people.profile}->>'name'`,
      headline: sql<string>`${people.profile}->>'headline'`,
      portrait: sql<boolean>`${people.portrait} is not null`,
    })
    .from(people)
    .where(inArray(people.id, ids))
  return new Map(rows.map(({ id, ...face }) => [id, face]))
}

export async function myConversations(db: Database, personId: string): Promise<MyConversation[]> {
  const rows = await db
    .select()
    .from(conversations)
    .where(or(eq(conversations.personA, personId), eq(conversations.personB, personId)))
    .orderBy(desc(conversations.startedAt))
    .limit(100)
  const others = rows.map((row) => (row.personA === personId ? row.personB : row.personA))
  const faces = await facesOf(db, others)
  return rows.map((row, i) => ({
    id: row.id,
    with: faces.get(others[i]!)?.name ?? 'Someone',
    withId: others[i]!,
    portrait: faces.get(others[i]!)?.portrait ?? false,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
  }))
}

export async function myMatches(database: Database, personId: string): Promise<Matches> {
  return database.transaction((db) => matchesInSnapshot(db, personId), {
    isolationLevel: 'repeatable read',
    accessMode: 'read only',
  })
}

async function matchesInSnapshot(db: Transaction, personId: string): Promise<Matches> {
  const mine = await db
    .select()
    .from(impressions)
    .where(eq(impressions.ownerId, personId))
    .orderBy(desc(impressions.createdAt))
  const latest = new Map<string, (typeof mine)[number]>()
  for (const impression of mine)
    if (!latest.has(impression.aboutId)) latest.set(impression.aboutId, impression)
  const faces = await facesOf(db, [...latest.keys()])
  const matchedIds = [...latest.values()].filter((i) => i.verdict === 'match').map((i) => i.aboutId)
  const theirs =
    matchedIds.length === 0
      ? []
      : await db
          .select()
          .from(impressions)
          .where(and(inArray(impressions.ownerId, matchedIds), eq(impressions.aboutId, personId)))
          .orderBy(desc(impressions.createdAt))
  const theirLatest = new Map<string, (typeof theirs)[number]>()
  for (const impression of theirs) {
    if (!theirLatest.has(impression.ownerId)) theirLatest.set(impression.ownerId, impression)
  }
  return {
    verdicts: [...latest.values()].map((i) => ({
      about: faces.get(i.aboutId)?.name ?? 'Someone',
      aboutId: i.aboutId,
      portrait: faces.get(i.aboutId)?.portrait ?? false,
      conversationId: i.conversationId,
      verdict: i.verdict,
      reason: i.reason,
      at: i.createdAt.toISOString(),
    })),
    mutual: matchedIds
      .filter((id) => theirLatest.get(id)?.verdict === 'match')
      .map((id) => ({
        personId: id,
        name: faces.get(id)?.name ?? 'Someone',
        headline: faces.get(id)?.headline ?? '',
        portrait: faces.get(id)?.portrait ?? false,
        conversationId: latest.get(id)!.conversationId,
        myReason: latest.get(id)!.reason,
        theirReason: theirLatest.get(id)!.reason,
        at: new Date(
          Math.max(latest.get(id)!.createdAt.getTime(), theirLatest.get(id)!.createdAt.getTime()),
        ).toISOString(),
      })),
  }
}

export async function thread(db: Database, personId: string): Promise<ThreadMessage[]> {
  const rows = await db
    .select({
      direction: ownerMessages.direction,
      text: ownerMessages.text,
      at: ownerMessages.createdAt,
    })
    .from(ownerMessages)
    .where(eq(ownerMessages.personId, personId))
    .orderBy(desc(ownerMessages.id))
    .limit(200)
  return rows.reverse().map((row) => ({ ...row, at: row.at.toISOString() }))
}

export async function personCard(db: Database, personId: string): Promise<PersonCard | null> {
  const [person] = await db
    .select({
      id: people.id,
      profile: people.profile,
      conversationId: people.conversationId,
      portrait: sql<boolean>`${people.portrait} is not null`,
    })
    .from(people)
    .where(eq(people.id, personId))
  if (!person) return null
  return {
    id: person.id,
    name: person.profile.name,
    headline: person.profile.headline,
    currentWork: person.profile.current_work,
    interests: person.profile.interests,
    avatar: person.profile.avatar,
    portrait: person.portrait,
    linkedin:
      person.profile.links.find((link) => /^https:\/\/(\w+\.)?linkedin\.com\//.test(link)) ?? null,
    conversationId: person.conversationId,
    conversations: (await myConversations(db, person.id)).slice(0, 20),
  }
}

export async function portraitOf(db: Database, personId: string) {
  const [person] = await db
    .select({ portrait: people.portrait })
    .from(people)
    .where(eq(people.id, personId))
  return person?.portrait ?? null
}

const others = alias(people, 'others')

export async function timeline(
  db: Database,
  personId: string,
  now = new Date(),
): Promise<TimelineEvent[]> {
  const rows = await db
    .select({
      id: worldEvents.id,
      kind: worldEvents.kind,
      placeId: worldEvents.placeId,
      otherId: others.id,
      otherName: sql<string | null>`${others.profile}->>'name'`,
      otherPortrait: sql<boolean>`${others.portrait} is not null`,
      note: worldEvents.note,
      at: worldEvents.createdAt,
    })
    .from(worldEvents)
    .leftJoin(others, eq(worldEvents.otherId, others.id))
    .where(and(eq(worldEvents.personId, personId), lte(worldEvents.createdAt, now)))
    .orderBy(desc(worldEvents.createdAt), desc(worldEvents.id))
    .limit(100)
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    placeId: row.placeId,
    other: row.otherId
      ? { id: row.otherId, name: row.otherName ?? '', portrait: row.otherPortrait }
      : null,
    note: row.note,
    at: row.at.toISOString(),
  }))
}
