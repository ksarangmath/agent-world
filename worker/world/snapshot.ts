import { and, eq, isNotNull } from 'drizzle-orm'
import type { WorldSnapshot } from '../../shared/api'
import type { Metro } from '../../shared/metros'
import type { Database } from '../db/client'
import { people } from '../db/schema'
import { isAwake } from './people'

export async function worldSnapshot(db: Database, now: Date, metro: Metro): Promise<WorldSnapshot> {
  const rows = await db
    .select({
      id: people.id,
      profile: people.profile,
      placeId: people.placeId,
      tileX: people.tileX,
      tileY: people.tileY,
      tripFromX: people.tripFromX,
      tripFromY: people.tripFromY,
      departedAt: people.departedAt,
      arrivesAt: people.arrivesAt,
      conversationId: people.conversationId,
      agentId: people.agentId,
      awakeUntil: people.awakeUntil,
    })
    .from(people)
    .where(and(isNotNull(people.placeId), eq(people.metro, metro)))
  return {
    now: now.toISOString(),
    people: rows.map((row) => {
      const traveling = row.arrivesAt !== null && row.arrivesAt > now && row.departedAt !== null
      return {
        id: row.id,
        name: row.profile.name,
        avatar: row.profile.avatar,
        placeId: row.placeId!,
        tile: { x: row.tileX!, y: row.tileY! },
        trip: traveling
          ? {
              from: { x: row.tripFromX!, y: row.tripFromY! },
              departedAt: row.departedAt!.toISOString(),
              arrivesAt: row.arrivesAt!.toISOString(),
            }
          : null,
        conversationId: row.conversationId,
        asleep: row.agentId !== null && !traveling && !row.conversationId && !isAwake(row, now),
      }
    }),
  }
}
