import { eq, inArray } from 'drizzle-orm'
import { authUsers } from 'drizzle-orm/supabase'
import type { Database } from '../db/client'
import { handledToolCalls, people, profileDrafts } from '../db/schema'
import { logError } from '../log'
import { archiveAgent, deleteMemoryStore } from '../omnara/agents'
import { isGone } from '../omnara/client'
import { sendDeliveries, type Services } from '../tools/run'
import { removePerson } from '../world/removal'

const tries = 3

async function account(db: Database, userId: string) {
  const [person] = await db
    .select({ id: people.id, agentId: people.agentId, memoryStoreId: people.memoryStoreId })
    .from(people)
    .where(eq(people.userId, userId))
  const [draft] = await db
    .select({ builderAgentId: profileDrafts.builderAgentId })
    .from(profileDrafts)
    .where(eq(profileDrafts.userId, userId))
  return { person, builderAgentId: draft?.builderAgentId ?? null }
}

async function removeOnce(services: Services, userId: string) {
  const { db, omnara } = services
  const { person, builderAgentId } = await account(db, userId)
  const agentIds = [person?.agentId, builderAgentId].filter((id) => id !== null && id !== undefined)
  for (const agentId of agentIds) {
    await archiveAgent(omnara, agentId).catch((error: unknown) => {
      if (!isGone(error)) throw error
    })
  }
  const deliveries = await db.transaction(async (tx) => {
    const world = { tx, now: new Date(), deliveries: [] as string[] }
    const [current] = await tx
      .select({ id: people.id })
      .from(people)
      .where(eq(people.userId, userId))
    const moved =
      current?.id !== person?.id ||
      (person !== undefined && (await removePerson(world, person.id, person)) === 'moved')
    if (moved) return null
    if (agentIds.length > 0) {
      await tx.delete(handledToolCalls).where(inArray(handledToolCalls.agentId, agentIds))
    }
    await tx.delete(authUsers).where(eq(authUsers.id, userId))
    return world.deliveries
  })
  return deliveries && { deliveries, memoryStoreId: person?.memoryStoreId ?? null }
}

export async function deleteAccount(services: Services, userId: string) {
  let removed: Awaited<ReturnType<typeof removeOnce>> = null
  for (let attempt = 1; !removed; attempt++) {
    const last = attempt === tries
    removed = await removeOnce(services, userId).catch((error: unknown) => {
      if (last) throw error
      return null
    })
    if (!removed && last) throw new Error('the account kept changing while it was being deleted')
  }
  await sendDeliveries(services, removed.deliveries).catch((error: unknown) =>
    logError('deliveries after an account deletion will be retried', error),
  )
  if (removed.memoryStoreId) {
    await deleteMemoryStore(services.omnara, removed.memoryStoreId).catch((error: unknown) =>
      logError('deleting a memory store failed', error),
    )
  }
}
