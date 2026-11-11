import { database, type Database } from './db/client'
import { logError } from './log'
import { agentsOfProfile, archiveAgent } from './omnara/agents'
import { omnara } from './omnara/client'
import type { ToolWorker } from './omnara/tool-calls'
import { buildTimeoutMs, draftOfAgent } from './profile/builder'
import { syncAllAgentConfigs } from './profile/save'
import { sendPendingDeliveries, toolWorkers, type Services } from './tools/run'
import { endIfIdle, expireRequests, idleConversations } from './world/conversations'
import type { World } from './world/events'
import { nudgeIdlePeople, wakeAtDawn } from './world/people'

const launchGraceMs = 2 * 60 * 1000
const worldPageSize = 50
const builderPageSize = 3

const inTransaction = (db: Database, now: Date, fn: (world: World) => Promise<void>) =>
  db.transaction((tx) => fn({ tx, now, deliveries: [] }))

async function recover(worker: ToolWorker, limit: number) {
  let cursor: string | undefined
  do {
    cursor = (await worker.check({ cursor, limit })).nextCursor ?? undefined
  } while (cursor)
}

async function recoverToolCalls(services: Services, env: Env) {
  const { world, builder } = toolWorkers(services, env, true)
  await recover(world, worldPageSize).catch((error: unknown) =>
    logError('world tool call recovery stopped', error),
  )
  await recover(builder, builderPageSize)
}

async function archiveFinishedBuilders(services: Services, env: Env, now: Date) {
  for await (const agent of agentsOfProfile(services.omnara, env.OMNARA_BUILDER_PROFILE_ID)) {
    const draft = await draftOfAgent(services, agent.id)
    const orphan = !draft && now.getTime() - Date.parse(agent.created_at) > launchGraceMs
    const stale = draft && now.getTime() - draft.createdAt.getTime() > buildTimeoutMs
    if (orphan || draft?.done || stale) {
      await archiveAgent(services.omnara, agent.id).catch((error: unknown) =>
        logError('archiving a builder failed', error),
      )
    }
  }
}

export async function scheduled(_controller: ScheduledController, env: Env) {
  const now = new Date()
  const services = { db: database(env), omnara: omnara(env) }
  const { db } = services
  const steps: [string, () => Promise<void>][] = [
    ['expire requests', () => inTransaction(db, now, expireRequests)],
    [
      'end idle conversations',
      async () => {
        for (const id of await idleConversations(db, now)) {
          await inTransaction(db, now, (world) => endIfIdle(world, id))
        }
      },
    ],
    ['wake people at dawn', () => inTransaction(db, now, wakeAtDawn)],
    ['nudge idle people', () => inTransaction(db, now, nudgeIdlePeople)],
    ['send pending deliveries', () => sendPendingDeliveries(services)],
    ['recover tool calls', () => recoverToolCalls(services, env)],
    ['archive finished builders', () => archiveFinishedBuilders(services, env, now)],
    ['sync agent configs', () => syncAllAgentConfigs(services)],
  ]
  for (const [name, step] of steps) {
    try {
      await step()
    } catch (error) {
      logError(`scheduled step failed: ${name}`, error)
    }
  }
}
