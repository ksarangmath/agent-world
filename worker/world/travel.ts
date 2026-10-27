import { and, count, eq, gt, isNotNull, ne, sql } from 'drizzle-orm'
import { places, placesById, type Place } from '../../shared/map/places'
import { conversationRequests, people, worldEvents } from '../db/schema'
import { expirePendingRequests } from './conversations'
import { done, record, refuse, type Outcome, type World } from './events'
import { isAt, lockPeople, statusOf } from './people'

const words = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2)

export async function listPlaces(world: World, meId: string, interest?: string): Promise<Outcome> {
  const { tx } = world
  const [me] = await tx.select({ profile: people.profile }).from(people).where(eq(people.id, meId))
  const occupancy = new Map(
    (
      await tx
        .select({ placeId: people.placeId, count: count() })
        .from(people)
        .where(isNotNull(people.placeId))
        .groupBy(people.placeId)
    ).map((row) => [row.placeId, row.count]),
  )
  const visits = new Map(
    (
      await tx
        .select({ placeId: worldEvents.placeId, count: count() })
        .from(worldEvents)
        .where(and(eq(worldEvents.personId, meId), eq(worldEvents.kind, 'arrived')))
        .groupBy(worldEvents.placeId)
    ).map((row) => [row.placeId, row.count]),
  )
  const wanted = words(interest ?? me?.profile.interests.join(' ') ?? '')
  const score = (place: Place) =>
    wanted.filter((word) =>
      [...place.tags, place.name, place.neighborhood].some((text) =>
        text.toLowerCase().includes(word),
      ),
    ).length
  const ranked = places
    .map((place) => ({ place, score: score(place), occupancy: occupancy.get(place.id) ?? 0 }))
    .sort(
      (a, b) =>
        b.score - a.score || b.occupancy - a.occupancy || a.place.id.localeCompare(b.place.id),
    )
    .slice(0, 15)
  return done(
    JSON.stringify(
      ranked.map(({ place, occupancy }) => ({
        id: place.id,
        name: place.name,
        region: place.region,
        neighborhood: place.neighborhood,
        tags: place.tags,
        description: place.description,
        occupancy,
        capacity: place.capacity,
        your_visits: visits.get(place.id) ?? 0,
      })),
    ),
  )
}

export async function goTo(
  world: World,
  meId: string,
  placeId: string,
  reason: string,
): Promise<Outcome> {
  const { tx, now } = world
  const place = placesById.get(placeId)
  if (!place) return refuse(`There's no place "${placeId}". Use list_places to find place ids.`)
  const [{ spots }, { ferryTerminal, route }] = await Promise.all([
    import('../../shared/map/spots'),
    import('../../shared/map/route'),
  ])
  const me = (await lockPeople(world, [meId])).get(meId)!
  const status = statusOf(me, now)
  if (status === 'in_conversation') {
    return refuse("You're in a conversation. End it with end_conversation before you leave.")
  }
  if (status === 'traveling') return refuse("You're already on your way somewhere.")
  if (me.placeId === placeId) return refuse(`You're already at ${place.name}.`)

  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${placeId}))`)
  const taken = await tx
    .select({ x: people.tileX, y: people.tileY })
    .from(people)
    .where(eq(people.placeId, placeId))
  const spot = spots(place).find((tile) => !taken.some((t) => t.x === tile.x && t.y === tile.y))
  if (!spot) return refuse(`${place.name} is full right now. Try another place.`)

  const from = me.tileX !== null && me.tileY !== null ? { x: me.tileX, y: me.tileY } : ferryTerminal
  const arrivesAt = new Date(now.getTime() + Math.ceil(route(from, spot).seconds * 1000))
  await expirePendingRequests(world, [me.id], `${me.profile.name} left`)
  await tx
    .update(people)
    .set({
      placeId,
      tileX: spot.x,
      tileY: spot.y,
      tripFromX: from.x,
      tripFromY: from.y,
      departedAt: now,
      arrivesAt,
    })
    .where(eq(people.id, me.id))
  await record(world, me.id, 'arrived', arrivesAt, { placeId, note: reason })
  return done(
    `You arrived at ${place.name} (${place.neighborhood}). ${place.description} Use look_around to see who's here.`,
    arrivesAt,
  )
}

export async function lookAround(world: World, meId: string): Promise<Outcome> {
  const { tx, now } = world
  const [me] = await tx.select().from(people).where(eq(people.id, meId))
  if (!me?.placeId) return done("You're not at any place yet. Use list_places, then go_to.")
  const place = placesById.get(me.placeId)!
  if (statusOf(me, now) === 'traveling') {
    const seconds = Math.ceil((me.arrivesAt!.getTime() - now.getTime()) / 1000)
    return done(`You're on your way to ${place.name}, arriving in about ${seconds} seconds.`)
  }
  const others = await tx
    .select()
    .from(people)
    .where(and(eq(people.placeId, me.placeId), ne(people.id, me.id)))
  const pending = await tx
    .select({
      id: conversationRequests.id,
      fromId: conversationRequests.fromId,
      toId: conversationRequests.toId,
      opener: conversationRequests.opener,
    })
    .from(conversationRequests)
    .where(
      and(
        eq(conversationRequests.status, 'pending'),
        gt(conversationRequests.expiresAt, now),
        sql`${meId} in (${conversationRequests.fromId}, ${conversationRequests.toId})`,
      ),
    )
  const names = new Map(others.map((p) => [p.id, p.profile]))
  return done(
    JSON.stringify({
      place: {
        id: place.id,
        name: place.name,
        neighborhood: place.neighborhood,
        description: place.description,
      },
      your_status: statusOf(me, now),
      people_here: others
        .filter((person) => isAt(person, place.id, now))
        .map((person) => ({
          person_id: person.id,
          name: person.profile.name,
          headline: person.profile.headline,
          top_interests: person.profile.interests.slice(0, 3),
          status: statusOf(person, now),
        })),
      requests_for_you: pending
        .filter((request) => request.toId === meId)
        .map((request) => ({
          request_id: request.id,
          from_person_id: request.fromId,
          from: names.get(request.fromId)?.name ?? 'someone who left',
          opener: request.opener,
        })),
      your_pending_request:
        pending
          .filter((request) => request.fromId === meId)
          .map((request) => ({ request_id: request.id, to_person_id: request.toId }))[0] ?? null,
    }),
  )
}
