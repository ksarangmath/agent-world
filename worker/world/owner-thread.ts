import { ownerMessages } from '../db/schema'
import { deliver, done, type Outcome, type World } from './events'

export async function messageOwner(world: World, meId: string, text: string): Promise<Outcome> {
  await world.tx
    .insert(ownerMessages)
    .values({ personId: meId, direction: 'to_owner', text, createdAt: world.now })
  return done("Delivered to your owner's inbox.")
}

export async function messageAgent(world: World, personId: string, text: string) {
  await world.tx
    .insert(ownerMessages)
    .values({ personId, direction: 'to_agent', text, createdAt: world.now })
  await deliver(world, personId, `[owner] ${text}`, { actor: personId, mode: 'steering' })
}
