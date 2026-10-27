import { and, isNotNull } from 'drizzle-orm'
import type { WorldSnapshot } from '../../shared/api'
import type { Database } from '../db/client'
import { people } from '../db/schema'

export async function worldSnapshot(db: Database, now: Date): Promise<WorldSnapshot> {
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
    })
    .from(people)
    .where(and(isNotNull(people.agentId), isNotNull(people.placeId)))
  return {
    now: now.toISOString(),
    people: rows.map((row) => ({
      id: row.id,
      name: row.profile.name,
      avatar: row.profile.avatar,
      placeId: row.placeId!,
      tile: { x: row.tileX!, y: row.tileY! },
      trip:
        row.arrivesAt && row.arrivesAt > now && row.departedAt
          ? {
              from: { x: row.tripFromX!, y: row.tripFromY! },
              departedAt: row.departedAt.toISOString(),
              arrivesAt: row.arrivesAt.toISOString(),
            }
          : null,
      conversationId: row.conversationId,
    })),
  }
}
