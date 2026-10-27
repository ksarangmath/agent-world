import type { DeliveryMode, WorldEventKind } from '../../shared/world'
import type { Transaction } from '../db/client'
import { deliveries, worldEvents } from '../db/schema'

export type World = { tx: Transaction; now: Date; deliveries: string[] }

export type Outcome = { ok: boolean; text: string; dueAt?: Date }

export const done = (text: string, dueAt?: Date): Outcome => ({ ok: true, text, dueAt })

export const refuse = (text: string): Outcome => ({ ok: false, text })

export async function deliver(
  world: World,
  to: string,
  text: string,
  options: { actor?: string; mode?: DeliveryMode } = {},
) {
  const [delivery] = await world.tx
    .insert(deliveries)
    .values({
      personId: to,
      text,
      actorId: options.actor ?? null,
      mode: options.mode ?? 'queued',
    })
    .returning({ id: deliveries.id })
  world.deliveries.push(delivery!.id)
}

export async function record(
  { tx }: World,
  personId: string,
  kind: WorldEventKind,
  at: Date,
  details: { placeId?: string; otherId?: string; note?: string } = {},
) {
  await tx.insert(worldEvents).values({
    personId,
    kind,
    placeId: details.placeId ?? null,
    otherId: details.otherId ?? null,
    note: details.note ?? null,
    createdAt: at,
  })
}

export const worldEvent = (event: string, details: Record<string, unknown> = {}) =>
  `[world] ${JSON.stringify({ event, ...details })}`
