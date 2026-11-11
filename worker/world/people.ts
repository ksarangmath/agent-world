import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  notExists,
  or,
  sql,
} from 'drizzle-orm'
import type { Profile } from '../../shared/profile'
import type { PersonStatus } from '../../shared/world'
import { conversationRequests, deliveries, people } from '../db/schema'
import { clockTime, deliver, refuse, timeZone, worldEvent, type World } from './events'

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
  restingUntil: people.restingUntil,
  awakeUntil: people.awakeUntil,
  lastActiveAt: people.lastActiveAt,
  lastNudgedAt: people.lastNudgedAt,
  profileVersion: people.profileVersion,
  configVersion: people.configVersion,
  templateVersion: people.templateVersion,
  createdAt: people.createdAt,
}

export const isAwake = (person: Pick<Person, 'agentId' | 'awakeUntil'>, now: Date) =>
  person.agentId !== null && person.awakeUntil !== null && person.awakeUntil > now

export function statusOf(person: Person, now: Date): PersonStatus {
  if (person.conversationId) return 'in_conversation'
  if (person.arrivesAt && person.arrivesAt > now) return 'traveling'
  if (!isAwake(person, now)) return 'asleep'
  if (person.restingUntil && person.restingUntil > now) return 'resting'
  return 'available'
}

export const asleep = refuse(
  "You're asleep until you're woken up. Stop here: nothing more happens until then.",
)

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
export const wakingHours = { from: 7, to: 24 } as const
export const selfWakingUntil = new Date('2026-11-22T08:00:00Z')
const batch = 500
const pacificParts = new Intl.DateTimeFormat('en-US', {
  timeZone,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
})

function wallClock(at: Date) {
  const field = Object.fromEntries(
    pacificParts.formatToParts(at).map((part) => [part.type, Number(part.value)]),
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>
  return Date.UTC(field.year, field.month - 1, field.day, field.hour, field.minute, field.second)
}

const offsetAt = (at: Date) => wallClock(at) - Math.floor(at.getTime() / 1000) * 1000

function pacific(now: Date, hour: number, days = 0) {
  const today = new Date(wallClock(now))
  const wall = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate() + days,
    hour,
  )
  return new Date(wall - offsetAt(new Date(wall - offsetAt(now))))
}

export const startOfDay = (now: Date) => pacific(now, 0)

export function nextBedtime(now: Date) {
  const tonight = pacific(now, wakingHours.to)
  return tonight > now ? tonight : pacific(now, wakingHours.to, 1)
}

function isWakingHour(now: Date) {
  const hour = new Date(wallClock(now)).getUTCHours()
  return hour >= wakingHours.from && hour < wakingHours.to
}

export async function wake(world: World, personId: string) {
  const { tx, now } = world
  const person = (await lockPeople(world, [personId])).get(personId)!
  if (isAwake(person, now)) return person.awakeUntil!
  const until = nextBedtime(now)
  await tx.update(people).set({ awakeUntil: until }).where(eq(people.id, personId))
  await deliver(
    world,
    personId,
    worldEvent('woke_up', {
      time: clockTime(now),
      awake_until: clockTime(until),
      next: 'Look around and decide what to do next.',
    }),
  )
  return until
}

export async function wakeAtDawn(world: World) {
  const { tx, now } = world
  if (now >= selfWakingUntil || !isWakingHour(now)) return
  const sleepers = await tx
    .select({ id: people.id })
    .from(people)
    .where(
      and(isNotNull(people.agentId), or(isNull(people.awakeUntil), lte(people.awakeUntil, now))),
    )
    .orderBy(asc(people.id))
    .limit(batch)
    .for('no key update', { skipLocked: true })
  for (const sleeper of sleepers) await wake(world, sleeper.id)
}

export async function nudgeIdlePeople(world: World) {
  const { tx, now } = world
  const eligible = and(
    isNotNull(people.agentId),
    gt(people.awakeUntil, now),
    isNull(people.conversationId),
    or(isNull(people.arrivesAt), lte(people.arrivesAt, now)),
    or(isNull(people.restingUntil), lte(people.restingUntil, now)),
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
    .limit(batch)
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
    time: clockTime(now),
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
  { tx, now }: World,
  personId: string,
  agent: { agentId?: string; memoryStoreId?: string },
) {
  await tx
    .update(people)
    .set({ ...agent, ...(agent.agentId && { awakeUntil: nextBedtime(now) }) })
    .where(eq(people.id, personId))
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

export async function markConfigSynced(
  { tx }: World,
  personId: string,
  versions: { configVersion: number; templateVersion: number },
) {
  await tx.update(people).set(versions).where(eq(people.id, personId))
}
