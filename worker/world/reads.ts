import { and, asc, desc, eq, inArray, or } from 'drizzle-orm'
import type {
  Matches,
  MyConversation,
  PersonCard,
  ThreadMessage,
  Transcript,
} from '../../shared/api'
import type { Database, Transaction } from '../db/client'
import { conversations, impressions, messages, ownerMessages, people } from '../db/schema'

export async function transcript(db: Database, conversationId: string): Promise<Transcript | null> {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
  if (!conversation) return null
  const pair = await db
    .select({ id: people.id, profile: people.profile })
    .from(people)
    .where(inArray(people.id, [conversation.personA, conversation.personB]))
  const lines = await db
    .select({ senderId: messages.senderId, text: messages.text, at: messages.createdAt })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.id))
  return {
    id: conversation.id,
    placeId: conversation.placeId,
    people: pair.map((p) => ({ id: p.id, name: p.profile.name, headline: p.profile.headline })),
    endedAt: conversation.endedAt?.toISOString() ?? null,
    messages: lines.map((line) => ({ ...line, at: line.at.toISOString() })),
  }
}

export async function myConversations(db: Database, personId: string): Promise<MyConversation[]> {
  const rows = await db
    .select()
    .from(conversations)
    .where(or(eq(conversations.personA, personId), eq(conversations.personB, personId)))
    .orderBy(desc(conversations.startedAt))
    .limit(100)
  const others = rows.map((row) => (row.personA === personId ? row.personB : row.personA))
  const names = new Map(
    others.length === 0
      ? []
      : (
          await db
            .select({ id: people.id, profile: people.profile })
            .from(people)
            .where(inArray(people.id, others))
        ).map((p) => [p.id, p.profile.name]),
  )
  return rows.map((row, i) => ({
    id: row.id,
    with: names.get(others[i]!) ?? 'Someone',
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
  const about = [...latest.keys()]
  const profiles = new Map(
    about.length === 0
      ? []
      : (
          await db
            .select({ id: people.id, profile: people.profile })
            .from(people)
            .where(inArray(people.id, about))
        ).map((p) => [p.id, p.profile]),
  )
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
      about: profiles.get(i.aboutId)?.name ?? 'Someone',
      aboutId: i.aboutId,
      verdict: i.verdict,
      reason: i.reason,
      at: i.createdAt.toISOString(),
    })),
    mutual: matchedIds
      .filter((id) => theirLatest.get(id)?.verdict === 'match')
      .map((id) => ({
        personId: id,
        name: profiles.get(id)?.name ?? 'Someone',
        headline: profiles.get(id)?.headline ?? '',
        myReason: latest.get(id)!.reason,
        theirReason: theirLatest.get(id)!.reason,
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
    .select({ id: people.id, profile: people.profile, conversationId: people.conversationId })
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
    conversationId: person.conversationId,
    conversations: (await myConversations(db, person.id)).slice(0, 20),
  }
}
