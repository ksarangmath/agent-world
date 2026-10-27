import { database, type Database } from './db/client'
import { logError } from './log'
import { agentsOfProfile, archiveAgent, type Agent } from './omnara/agents'
import { omnara } from './omnara/client'
import { readyCustomCalls } from './omnara/tool-calls'
import { buildTimeoutMs, draftOfAgent } from './profile/builder'
import { syncAllAgentConfigs } from './profile/save'
import {
  personOfAgent,
  runBuilderCall,
  postDueResults,
  runToolCall,
  sendPendingDeliveries,
  type Services,
} from './tools/run'
import { endIfIdle, expireRequests, idleConversations } from './world/conversations'
import type { World } from './world/events'
import { nudgeIdlePeople } from './world/people'

const stuckAfterMs = 20_000
const launchGraceMs = 2 * 60 * 1000

const inTransaction = (db: Database, now: Date, fn: (world: World) => Promise<void>) =>
  db.transaction((tx) => fn({ tx, now, deliveries: [] }))

async function reconcileAgent(services: Services, env: Env, agent: Agent, now: Date) {
  if (agent.agent_profile_id === env.OMNARA_BUILDER_PROFILE_ID) {
    const draft = await draftOfAgent(services, agent.id)
    const orphan = !draft && now.getTime() - Date.parse(agent.created_at) > launchGraceMs
    const stale = draft && now.getTime() - draft.createdAt.getTime() > buildTimeoutMs
    if (orphan || draft?.done || stale) return archiveAgent(services.omnara, agent.id)
    if (!draft) return
  }
  const activity = agent.activity
  if (activity?.state !== 'running') return
  if (now.getTime() - Date.parse(activity.last_activity_at) < stuckAfterMs) return
  const person = await personOfAgent(services.db, agent.id)
  if (person && person.arrivesAt && person.arrivesAt > now) return
  const draft = person ? undefined : await draftOfAgent(services, agent.id)
  if (!person && !draft) return
  for (const call of await readyCustomCalls(services.omnara, agent.id)) {
    if (person) await runToolCall(services, person.id, call)
    if (draft) await runBuilderCall(services, env, draft, call)
  }
}

async function reconcile(services: Services, env: Env, now: Date) {
  for (const profileId of [env.OMNARA_WORLD_PROFILE_ID, env.OMNARA_BUILDER_PROFILE_ID]) {
    for await (const agent of agentsOfProfile(services.omnara, profileId)) {
      await reconcileAgent(services, env, agent, now).catch((error: unknown) =>
        logError('reconciling an agent failed', error),
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
    ['nudge idle people', () => inTransaction(db, now, nudgeIdlePeople)],
    ['send pending deliveries', () => sendPendingDeliveries(services)],
    ['post due results', () => postDueResults(services)],
    ['reconcile tool calls', () => reconcile(services, env, now)],
    ['sync agent configs', () => syncAllAgentConfigs(services, env)],
  ]
  for (const [name, step] of steps) {
    try {
      await step()
    } catch (error) {
      logError(`scheduled step failed: ${name}`, error)
    }
  }
}
