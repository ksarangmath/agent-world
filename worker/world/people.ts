import { and, asc, eq, inArray, isNotNull, isNull, lt, lte, notExists, or, sql } from 'drizzle-orm'
import type { Profile } from '../../shared/profile'
import type { PersonStatus } from '../../shared/world'
import { conversationRequests, deliveries, people } from '../db/schema'
import { worldEvent, type World } from './events'

export type Person = Omit<typeof people.$inferSelect, 'portrait'>

export const personColumns = {
  id: people.id,
  userId: people.userId,
  profile: people.profile,
  agentId: people.agentId,
  memoryStoreId: people.memoryStoreId,
  placeId: people.placeId,
  tileX: people.tileX,
  tileY: people.tileY,
  tripFromX: people.tripFromX,
  tripFromY: people.tripFromY,
  departedAt: people.departedAt,
  arrivesAt: people.arrivesAt,
  conversationId: people.conversationId,
  lastActiveAt: people.lastActiveAt,
  lastNudgedAt: people.lastNudgedAt,
  profileVersion: people.profileVersion,
  configVersion: people.configVersion,
  createdAt: people.createdAt,
}

export function statusOf(person: Person, now: Date): PersonStatus {
  if (person.conversationId) return 'in_conversation'
  if (person.arrivesAt && person.arrivesAt > now) return 'traveling'
  return 'available'
}

export const isAt = (person: Person, placeId: string, now: Date) =>
  person.placeId === placeId && statusOf(person, now) !== 'traveling'

export const describe = (person: Person) => `${person.profile.name} (${person.profile.headline})`

export async function lockPeople({ tx }: World, ids: string[]): Promise<Map<string, Person>> {
  const rows = await tx
    .select(personColumns)
    .from(people)
    .where(inArray(people.id, ids))
    .orderBy(asc(people.id))
    .for('no key update')
  return new Map(rows.map((row) => [row.id, row]))
}

export async function touch({ tx, now }: World, personId: string) {
  await tx
    .update(people)
    .set({ lastActiveAt: sql`greatest(${people.lastActiveAt}, ${now.toISOString()})` })
    .where(eq(people.id, personId))
}

export const idleBeforeNudgeMs = 15 * 60 * 1000
export const wakingHours = { from: 8, to: 23, timeZone: 'America/Los_Angeles' } as const
const nudgeBatch = 500

export function isWakingHour(now: Date) {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: wakingHours.timeZone,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(now),
  )
  return hour >= wakingHours.from && hour < wakingHours.to
}

export async function nudgeIdlePeople(world: World) {
  const { tx, now } = world
  if (!isWakingHour(now)) return
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: wakingHours.timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(now)
  const eligible = and(
    isNotNull(people.agentId),
    isNull(people.conversationId),
    or(isNull(people.arrivesAt), lte(people.arrivesAt, now)),
    lte(people.lastActiveAt, new Date(now.getTime() - idleBeforeNudgeMs)),
    or(isNull(people.lastNudgedAt), lt(people.lastNudgedAt, people.lastActiveAt)),
    notExists(
      tx
        .select({ id: conversationRequests.id })
        .from(conversationRequests)
        .where(
          and(
            eq(conversationRequests.status, 'pending'),
            or(
              eq(conversationRequests.fromId, people.id),
              eq(conversationRequests.toId, people.id),
            ),
          ),
        ),
    ),
  )
  const candidates = await tx
    .select({ id: people.id })
    .from(people)
    .where(eligible)
    .orderBy(asc(people.id))
    .limit(nudgeBatch)
    .for('no key update', { skipLocked: true })
  if (candidates.length === 0) return
  const nudged = await tx
    .update(people)
    .set({ lastNudgedAt: now })
    .where(
      and(
        inArray(
          people.id,
          candidates.map((row) => row.id),
        ),
        eligible,
      ),
    )
    .returning({ id: people.id })
  if (nudged.length === 0) return
  const ids = nudged.map((row) => row.id)
  const text = worldEvent('nudge', {
    time: `${time} PT`,
    you_are: 'free',
    next: 'Look around and decide what to do next.',
  })
  const rows = await tx
    .insert(deliveries)
    .values(ids.map((id) => ({ personId: id, text, mode: 'queued' as const })))
    .returning({ id: deliveries.id })
  world.deliveries.push(...rows.map((row) => row.id))
}

export async function createPerson(
  { tx, now }: World,
  userId: string,
  profile: Profile,
  portrait: Uint8Array | null,
) {
  const [person] = await tx
    .insert(people)
    .values({ userId, profile, portrait, lastActiveAt: now, createdAt: now })
    .onConflictDoUpdate({ target: people.userId, set: { profile, ...(portrait && { portrait }) } })
    .returning(personColumns)
  return person!
}

export async function setAgent(
  { tx }: World,
  personId: string,
  agent: { agentId?: string; memoryStoreId?: string },
) {
  await tx.update(people).set(agent).where(eq(people.id, personId))
}

export async function updateProfile(
  { tx }: World,
  personId: string,
  profile: Profile,
  portrait: Uint8Array | null,
) {
  await tx
    .update(people)
    .set({
      profile,
      profileVersion: sql`${people.profileVersion} + 1`,
      ...(portrait && { portrait }),
    })
    .where(eq(people.id, personId))
}

export async function markConfigSynced({ tx }: World, personId: string, version: number) {
  await tx.update(people).set({ configVersion: version }).where(eq(people.id, personId))
}
