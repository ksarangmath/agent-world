import { and, asc, eq, gt, inArray, isNull, lte, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Database } from '../db/client'
import { deliveries, handledToolCalls, people } from '../db/schema'
import { archiveAgent } from '../omnara/agents'
import { isPermanent, type Omnara } from '../omnara/client'
import { sendInput } from '../omnara/inputs'
import { submitResult, type ToolCall, type ToolResult } from '../omnara/tool-calls'
import { logError } from '../log'
import { refuse, type Outcome } from '../world/events'
import { saveDraft } from '../profile/builder'
import { touch } from '../world/people'
import type { Profile } from '../../shared/profile'
import { builderTools } from './builder'
import { worldTools } from './world'

export type Services = { db: Database; omnara: Omnara }

type Handled = typeof handledToolCalls.$inferSelect

const asResult = (outcome: Outcome): ToolResult => ({
  outcome: outcome.ok ? 'succeeded' : 'failed',
  content_blocks: [{ type: 'text', text: outcome.text }],
})

export async function personOfAgent(db: Database, agentId: string) {
  const [person] = await db
    .select({ id: people.id, arrivesAt: people.arrivesAt })
    .from(people)
    .where(eq(people.agentId, agentId))
  return person
}

export async function runToolCall(
  services: Services,
  personId: string,
  call: Pick<ToolCall, 'id' | 'agent_id' | 'name' | 'input'>,
) {
  const { db } = services
  const now = new Date()
  const handled = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${call.id}))`)
    const [existing] = await tx
      .select()
      .from(handledToolCalls)
      .where(eq(handledToolCalls.toolCallId, call.id))
    if (existing) return { row: existing, deliveryIds: [] as string[] }
    const world = { tx, now, deliveries: [] as string[] }
    const tool = Object.hasOwn(worldTools, call.name) ? worldTools[call.name] : undefined
    const outcome = tool
      ? await tool.call({ world, personId }, call.input)
      : refuse(`There is no tool named ${call.name}.`)
    await touch(world, personId)
    const [row] = await tx
      .insert(handledToolCalls)
      .values({
        toolCallId: call.id,
        agentId: call.agent_id,
        result: asResult(outcome),
        dueAt: outcome.dueAt ?? now,
        createdAt: now,
      })
      .returning()
    return { row: row!, deliveryIds: world.deliveries }
  })
  await sendDeliveries(services, handled.deliveryIds)
  if (!handled.row.postedAt && handled.row.dueAt <= new Date())
    await postResult(services, handled.row)
}

async function postResult({ db, omnara }: Services, row: Handled) {
  try {
    await submitResult(omnara, row.agentId, row.toolCallId, row.result as ToolResult)
  } catch (error) {
    if (!isPermanent(error)) throw error
    logError('dropping unpostable result', error)
  }
  await db
    .update(handledToolCalls)
    .set({ postedAt: new Date() })
    .where(eq(handledToolCalls.toolCallId, row.toolCallId))
}

const actors = alias(people, 'actors')
const drainBatch = 50

async function drainRecipient({ db, omnara }: Services, personId: string) {
  await db.transaction(async (tx) => {
    const [lock] = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(hashtext(${`deliveries:${personId}`})) as locked`,
    )
    if (!lock?.locked) return
    const rows = await tx
      .select({
        id: deliveries.id,
        text: deliveries.text,
        mode: deliveries.mode,
        agentId: people.agentId,
        actorId: actors.id,
        actorProfile: actors.profile,
      })
      .from(deliveries)
      .innerJoin(people, eq(deliveries.personId, people.id))
      .leftJoin(actors, eq(deliveries.actorId, actors.id))
      .where(and(eq(deliveries.personId, personId), isNull(deliveries.deliveredAt)))
      .orderBy(asc(deliveries.sequence))
      .limit(drainBatch)
    for (const row of rows) {
      if (!row.agentId) return
      try {
        await sendInput(omnara, row.agentId, {
          text: row.text,
          mode: row.mode,
          actor: row.actorId ? { id: row.actorId, name: row.actorProfile!.name } : null,
          key: row.id,
        })
      } catch (error) {
        if (!isPermanent(error)) return logError('delivery will be retried', error)
        logError('dropping undeliverable input', error)
      }
      await tx.update(deliveries).set({ deliveredAt: new Date() }).where(eq(deliveries.id, row.id))
    }
  })
}

export async function sendDeliveries(services: Services, ids: string[]) {
  if (ids.length === 0) return
  const recipients = await services.db
    .selectDistinct({ personId: deliveries.personId })
    .from(deliveries)
    .where(inArray(deliveries.id, ids))
  for (const { personId } of recipients) await drainRecipient(services, personId)
}

export async function sendPendingDeliveries(services: Services) {
  let after: string | undefined
  for (;;) {
    const recipients = await services.db
      .selectDistinct({ personId: deliveries.personId })
      .from(deliveries)
      .where(
        and(isNull(deliveries.deliveredAt), after ? gt(deliveries.personId, after) : undefined),
      )
      .orderBy(asc(deliveries.personId))
      .limit(200)
    if (recipients.length === 0) return
    for (const { personId } of recipients) {
      await drainRecipient(services, personId).catch((error: unknown) =>
        logError('draining deliveries failed', error),
      )
    }
    after = recipients.at(-1)!.personId
  }
}

export async function postDueResults(services: Services) {
  const due = await services.db
    .select()
    .from(handledToolCalls)
    .where(and(isNull(handledToolCalls.postedAt), lte(handledToolCalls.dueAt, new Date())))
    .orderBy(asc(handledToolCalls.dueAt))
    .limit(200)
  for (const row of due) {
    await postResult(services, row).catch((error: unknown) =>
      logError('posting result failed', error),
    )
  }
}

export async function runBuilderCall(
  services: Services,
  env: Env,
  draft: { userId: string; links: string[] },
  call: Pick<ToolCall, 'id' | 'agent_id' | 'name' | 'input'>,
) {
  const row = await services.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${call.id}))`)
    const [existing] = await tx
      .select()
      .from(handledToolCalls)
      .where(eq(handledToolCalls.toolCallId, call.id))
    if (existing) return existing
    const tool = Object.hasOwn(builderTools, call.name) ? builderTools[call.name] : undefined
    const context = {
      env,
      links: draft.links,
      saveDraft: (profile: Profile) => saveDraft(tx, draft.userId, call.agent_id, profile),
    }
    const outcome = tool
      ? await tool
          .call(context, call.input)
          .catch((error: unknown) =>
            refuse(`${call.name} failed: ${error instanceof Error ? error.name : 'unknown error'}`),
          )
      : refuse(`There is no tool named ${call.name}.`)
    const [inserted] = await tx
      .insert(handledToolCalls)
      .values({ toolCallId: call.id, agentId: call.agent_id, result: asResult(outcome) })
      .returning()
    return inserted!
  })
  if (!row.postedAt) await postResult(services, row)
  if (call.name === 'submit_profile' && (row.result as ToolResult).outcome === 'succeeded') {
    await archiveAgent(services.omnara, call.agent_id)
  }
}
