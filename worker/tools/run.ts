import { and, asc, eq, gt, inArray, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Database, Transaction } from '../db/client'
import { deliveries, handledToolCalls, people, profileDrafts } from '../db/schema'
import { archiveAgent } from '../omnara/agents'
import { isPermanent, type Omnara } from '../omnara/client'
import { sendInput } from '../omnara/inputs'
import { submitResult, type ToolCall, type ToolResult } from '../omnara/tool-calls'
import { logError } from '../log'
import { done, refuse, type Outcome } from '../world/events'
import { base64, downloadPhoto, saveDraft } from '../profile/builder'
import { drawPortrait } from '../profile/portrait'
import { touch } from '../world/people'
import type { Profile } from '../../shared/profile'
import { builderTools, portraitTools } from './builder'
import { worldTools } from './world'

export type Services = { db: Database; omnara: Omnara }

type Handled = typeof handledToolCalls.$inferSelect

const asResult = (outcome: Outcome): ToolResult => ({
  outcome: outcome.ok ? 'succeeded' : 'failed',
  content_blocks: [
    { type: 'text', text: outcome.text },
    ...(outcome.image
      ? [{ type: 'media' as const, media_type: outcome.image.mediaType, data: outcome.image.data }]
      : []),
  ],
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
    .select({ toolCallId: handledToolCalls.toolCallId })
    .from(handledToolCalls)
    .where(and(isNull(handledToolCalls.postedAt), lte(handledToolCalls.dueAt, new Date())))
    .orderBy(asc(handledToolCalls.dueAt))
    .limit(200)
  for (const { toolCallId } of due) {
    const [row] = await services.db
      .select()
      .from(handledToolCalls)
      .where(eq(handledToolCalls.toolCallId, toolCallId))
    if (!row || row.postedAt) continue
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
  scheduled: boolean,
) {
  if (Object.hasOwn(portraitTools, call.name)) {
    if (scheduled) await runPortraitCall(services, env, draft, call)
    return
  }
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

const portraitLeaseMs = 5 * 60 * 1000

type Call = Pick<ToolCall, 'id' | 'agent_id' | 'name' | 'input'>
type Claim =
  | { kind: 'handled'; row: Handled }
  | { kind: 'claimed'; photoUrl: string | null; claimedAt: Date }
  | { kind: 'busy' }

const ownedDraft = (userId: string, call: Call) =>
  and(eq(profileDrafts.userId, userId), eq(profileDrafts.builderAgentId, call.agent_id))

async function record(tx: Transaction, call: Call, outcome: Outcome) {
  const [row] = await tx
    .insert(handledToolCalls)
    .values({ toolCallId: call.id, agentId: call.agent_id, result: asResult(outcome) })
    .onConflictDoNothing()
    .returning()
  return row
}

export async function claimPortrait(
  db: Database,
  userId: string,
  call: Call,
  now: Date,
): Promise<Claim> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${call.id}))`)
    const [existing] = await tx
      .select()
      .from(handledToolCalls)
      .where(eq(handledToolCalls.toolCallId, call.id))
    if (existing) return { kind: 'handled', row: existing }
    const owned = ownedDraft(userId, call)
    const [claimed] = await tx
      .update(profileDrafts)
      .set({ portraitCallId: call.id, portraitClaimedAt: now })
      .where(
        and(
          owned,
          isNull(profileDrafts.profile),
          isNull(profileDrafts.portrait),
          or(
            isNull(profileDrafts.portraitClaimedAt),
            lt(profileDrafts.portraitClaimedAt, new Date(now.getTime() - portraitLeaseMs)),
          ),
        ),
      )
      .returning({ photoUrl: profileDrafts.photoUrl })
    if (claimed) return { kind: 'claimed', photoUrl: claimed.photoUrl, claimedAt: now }
    const [draft] = await tx
      .select({
        drawn: isNotNull(profileDrafts.portrait),
        done: isNotNull(profileDrafts.profile),
      })
      .from(profileDrafts)
      .where(owned)
    if (draft && !draft.drawn && !draft.done) return { kind: 'busy' }
    const reason = draft?.drawn
      ? 'The portrait is already drawn. Continue with submit_profile.'
      : 'This profile build is over. Stop here.'
    return { kind: 'handled', row: (await record(tx, call, refuse(reason)))! }
  })
}

export async function finishPortrait(
  db: Database,
  userId: string,
  call: Call,
  claimedAt: Date,
  portrait: Uint8Array | null,
  outcome: Outcome,
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${call.id}))`)
    const [kept] = await tx
      .update(profileDrafts)
      .set({ portraitClaimedAt: null, ...(portrait && { portrait }) })
      .where(
        and(
          ownedDraft(userId, call),
          eq(profileDrafts.portraitCallId, call.id),
          eq(profileDrafts.portraitClaimedAt, claimedAt),
          isNull(profileDrafts.profile),
        ),
      )
      .returning({ userId: profileDrafts.userId })
    return kept ? record(tx, call, outcome) : undefined
  })
}

async function runPortraitCall(
  services: Services,
  env: Env,
  draft: { userId: string },
  call: Call,
) {
  const claim = await claimPortrait(services.db, draft.userId, call, new Date())
  if (claim.kind === 'handled') {
    if (!claim.row.postedAt) await postResult(services, claim.row)
    return
  }
  if (claim.kind === 'busy') return
  let portrait: Uint8Array | null = null
  const draw = async (description: string) => {
    const photo = await downloadPhoto(claim.photoUrl)
    portrait = await drawPortrait(env.OPENAI_API_KEY, photo, description)
    return {
      ...done(
        "Here is the portrait. Choose the avatar presets so their character on the map matches it: gender, build, skin tone, hair style and color, facial hair, glasses, and the top's style and color, plus pants, shorts, or a skirt and shoes that fit.",
      ),
      image: { mediaType: 'image/webp' as const, data: base64(portrait) },
    }
  }
  const outcome = await portraitTools[call.name]!.call({ draw }, call.input).catch(
    (error: unknown) =>
      refuse(`${call.name} failed: ${error instanceof Error ? error.name : 'unknown error'}`),
  )
  const row = await finishPortrait(
    services.db,
    draft.userId,
    call,
    claim.claimedAt,
    portrait,
    outcome,
  )
  if (row) await postResult(services, row)
}
