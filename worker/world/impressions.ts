import { and, desc, eq, ne } from 'drizzle-orm'
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
  whatChanged?: string,
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
  const [before] = await tx
    .select({ verdict: impressions.verdict, reason: impressions.reason })
    .from(impressions)
    .where(
      and(
        eq(impressions.ownerId, meId),
        eq(impressions.aboutId, aboutId),
        ne(impressions.conversationId, conversation.id),
      ),
    )
    .orderBy(desc(impressions.createdAt))
    .limit(1)
  if (verdict === 'match' && before?.verdict === 'not_a_match' && !whatChanged) {
    return refuse(
      `Last time you judged them not_a_match: ${JSON.stringify(before.reason)}. Another good chat doesn't change that, and neither does a plan made today. Record not_a_match again. Only if you learned of a goal or an offer of theirs or yours that you hadn't heard before, call again with match and name it in what_changed.`,
    )
  }

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
  await record(world, meId, verdict === 'match' ? 'judged_match' : 'judged_not_a_match', now, {
    otherId: aboutId,
    note: reason,
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
