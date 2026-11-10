import { desc, eq } from 'drizzle-orm'
import { ownerMessages } from '../db/schema'
import { clockTime, deliver, done, refuse, type Outcome, type World } from './events'
import { lockPeople } from './people'

export const unpromptedOwnerMessageMs = 2 * 60 * 60 * 1000

export async function messageOwner(world: World, meId: string, text: string): Promise<Outcome> {
  const { tx, now } = world
  await lockPeople(world, [meId])
  const [last] = await tx
    .select({ direction: ownerMessages.direction, createdAt: ownerMessages.createdAt })
    .from(ownerMessages)
    .where(eq(ownerMessages.personId, meId))
    .orderBy(desc(ownerMessages.id))
    .limit(1)
  const unprompted = last?.direction === 'to_owner'
  if (unprompted && last.createdAt.getTime() > now.getTime() - unpromptedOwnerMessageMs) {
    const again = new Date(last.createdAt.getTime() + unpromptedOwnerMessageMs)
    return refuse(
      `You already wrote at ${clockTime(last.createdAt)}. Save the next message for a real match; you can write again after ${clockTime(again)}, or sooner if they write to you.`,
    )
  }
  await tx
    .insert(ownerMessages)
    .values({ personId: meId, direction: 'to_owner', text, createdAt: now })
  return done("Delivered to your owner's inbox.")
}

export async function messageAgent(world: World, personId: string, text: string) {
  await lockPeople(world, [personId])
  await world.tx
    .insert(ownerMessages)
    .values({ personId, direction: 'to_agent', text, createdAt: world.now })
  await deliver(world, personId, `[owner] ${text}`, { actor: personId, mode: 'steering' })
}
