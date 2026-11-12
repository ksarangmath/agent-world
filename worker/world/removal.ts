import { eq, inArray, or } from 'drizzle-orm'
import {
  conversationRequests,
  conversations,
  deliveries,
  impressions,
  messages,
  ownerMessages,
  people,
  worldEvents,
} from '../db/schema'
import { expirePendingRequests } from './conversations'
import { clockTime, deliver, worldEvent, type World } from './events'
import { lockPeople } from './people'

export async function removePerson(
  world: World,
  personId: string,
  stopped: { agentId: string | null; memoryStoreId: string | null },
): Promise<'removed' | 'moved'> {
  const { tx, now } = world
  const [before] = await tx
    .select({ conversationId: people.conversationId })
    .from(people)
    .where(eq(people.id, personId))
  if (!before) return 'removed'
  const [open] = before.conversationId
    ? await tx
        .select({ a: conversations.personA, b: conversations.personB })
        .from(conversations)
        .where(eq(conversations.id, before.conversationId))
    : []
  const partnerId = open ? (open.a === personId ? open.b : open.a) : null
  const locked = await lockPeople(world, partnerId ? [personId, partnerId] : [personId])
  const person = locked.get(personId)
  if (!person) return 'removed'
  if (
    person.conversationId !== before.conversationId ||
    person.agentId !== stopped.agentId ||
    person.memoryStoreId !== stopped.memoryStoreId
  ) {
    return 'moved'
  }

  await expirePendingRequests(world, [personId], 'they left Agent World')
  await tx
    .update(people)
    .set({ conversationId: null })
    .where(inArray(people.id, [...locked.keys()]))
  if (partnerId) {
    await deliver(
      world,
      partnerId,
      worldEvent('conversation_ended', {
        with_person_id: personId,
        ended_by: 'them',
        reason: 'They left Agent World.',
        time: clockTime(now),
        next: 'They have left Agent World for good, so there is nothing to record about them. Carry on with your day.',
      }),
    )
  }

  const theirs = tx
    .select({ id: conversations.id })
    .from(conversations)
    .where(or(eq(conversations.personA, personId), eq(conversations.personB, personId)))
  await tx
    .delete(deliveries)
    .where(or(eq(deliveries.personId, personId), eq(deliveries.actorId, personId)))
  await tx
    .delete(worldEvents)
    .where(or(eq(worldEvents.personId, personId), eq(worldEvents.otherId, personId)))
  await tx.delete(ownerMessages).where(eq(ownerMessages.personId, personId))
  await tx
    .delete(impressions)
    .where(or(eq(impressions.ownerId, personId), eq(impressions.aboutId, personId)))
  await tx.delete(messages).where(inArray(messages.conversationId, theirs))
  await tx
    .delete(conversationRequests)
    .where(or(eq(conversationRequests.fromId, personId), eq(conversationRequests.toId, personId)))
  await tx
    .delete(conversations)
    .where(or(eq(conversations.personA, personId), eq(conversations.personB, personId)))
  await tx.delete(people).where(eq(people.id, personId))
  return 'removed'
}
