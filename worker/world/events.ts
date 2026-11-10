import type { DeliveryMode, WorldEventKind } from '../../shared/world'
import type { Transaction } from '../db/client'
import { deliveries, worldEvents } from '../db/schema'

export type World = { tx: Transaction; now: Date; deliveries: string[] }

export const timeZone = 'America/Los_Angeles'

export const clockTime = (at: Date) =>
  `${new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(at)} PT`

export type Outcome = {
  ok: boolean
  text: string
  dueAt?: Date
  image?: { mediaType: 'image/webp'; data: string }
}

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
