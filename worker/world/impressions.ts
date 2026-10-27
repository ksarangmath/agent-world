import { and, desc, eq } from 'drizzle-orm'
import type { Verdict } from '../../shared/world'
import { conversations, impressions, worldEvents } from '../db/schema'
import { done, record, refuse, type Outcome, type World } from './events'
import { lockPeople } from './people'

export async function recordImpression(
  world: World,
  meId: string,
  aboutId: string,
  verdict: Verdict,
  reason: string,
): Promise<Outcome> {
  const { tx, now } = world
  if (aboutId === meId) return refuse("You can't record an impression of yourself.")
  const locked = await lockPeople(world, [meId, aboutId])
  if (!locked.has(aboutId)) return refuse('There is no person with that id.')
  const [a, b] = meId < aboutId ? [meId, aboutId] : [aboutId, meId]
  const [conversation] = await tx
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.personA, a), eq(conversations.personB, b)))
    .orderBy(desc(conversations.startedAt))
    .limit(1)
  if (!conversation) return refuse("You haven't had a conversation with that person yet.")

  await tx
    .insert(impressions)
    .values({
      ownerId: meId,
      aboutId,
      conversationId: conversation.id,
      verdict,
      reason,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [impressions.ownerId, impressions.conversationId],
      set: { verdict, reason, createdAt: now },
    })

  const [theirs] = await tx
    .select({ verdict: impressions.verdict })
    .from(impressions)
    .where(and(eq(impressions.ownerId, aboutId), eq(impressions.aboutId, meId)))
    .orderBy(desc(impressions.createdAt))
    .limit(1)
  if (verdict === 'match' && theirs?.verdict === 'match') {
    const [already] = await tx
      .select({ id: worldEvents.id })
      .from(worldEvents)
      .where(
        and(
          eq(worldEvents.personId, meId),
          eq(worldEvents.kind, 'mutual_match'),
          eq(worldEvents.otherId, aboutId),
        ),
      )
      .limit(1)
    if (!already) {
      await record(world, meId, 'mutual_match', now, { otherId: aboutId })
      await record(world, aboutId, 'mutual_match', now, { otherId: meId })
    }
  }
  return done('Saved.')
}
