import { and, asc, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Database, Transaction } from '../db/client'
import { deliveries, handledToolCalls, people, profileDrafts } from '../db/schema'
import { isPermanent, type Omnara } from '../omnara/client'
import { sendInput } from '../omnara/inputs'
import {
  deferred,
  toolWorker,
  type ToolCall,
  type ToolHandler,
  type ToolResult,
} from '../omnara/tool-calls'
import { logError } from '../log'
import { done, refuse, type Outcome } from '../world/events'
import {
  base64,
  downloadPhoto,
  draftOfAgent,
  linkedInIdentity,
  saveDraft,
} from '../profile/builder'
import { drawPortrait } from '../profile/portrait'
import { touch } from '../world/people'
import type { Profile } from '../../shared/profile'
import { builderTools, portraitTools } from './builder'
import { worldTools } from './world'

export type Services = { db: Database; omnara: Omnara }

type Answer = Awaited<ReturnType<ToolHandler>>
type Handled = { result: unknown; dueAt: Date }

const handledColumns = { result: handledToolCalls.result, dueAt: handledToolCalls.dueAt }

const asResult = (outcome: Outcome): ToolResult => ({
  outcome: outcome.ok ? 'succeeded' : 'failed',
  content_blocks: [
    { type: 'text', text: outcome.text },
    ...(outcome.image
      ? [{ type: 'media' as const, media_type: outcome.image.mediaType, data: outcome.image.data }]
      : []),
  ],
})

const answer = (row: Handled): Answer =>
  row.dueAt <= new Date() ? (row.result as ToolResult) : deferred

const failed = (call: ToolCall) => (error: unknown) =>
  refuse(`${call.name} failed: ${error instanceof Error ? error.name : 'unknown error'}`)

async function stored(db: Database | Transaction, call: ToolCall) {
  const [row] = await db
    .select(handledColumns)
    .from(handledToolCalls)
    .where(eq(handledToolCalls.toolCallId, call.toolCallID))
  return row
}

async function lock(tx: Transaction, call: ToolCall) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${call.toolCallID}))`)
}

async function record(tx: Transaction, call: ToolCall, outcome: Outcome, now = new Date()) {
  const [row] = await tx
    .insert(handledToolCalls)
    .values({
      toolCallId: call.toolCallID,
      agentId: call.agentID,
      result: asResult(outcome),
      dueAt: outcome.dueAt ?? now,
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning(handledColumns)
  return row
}

async function personOfAgent(db: Database, agentId: string) {
  const [person] = await db
    .select({ id: people.id })
    .from(people)
    .where(eq(people.agentId, agentId))
  return person
}

export async function runWorldCall(services: Services, call: ToolCall): Promise<Answer> {
  const { db } = services
  const existing = await stored(db, call)
  if (existing) return answer(existing)
  const person = await personOfAgent(db, call.agentID)
  if (!person) return deferred
  const now = new Date()
  const { row, deliveryIds } = await db.transaction(async (tx) => {
    await lock(tx, call)
    const locked = await stored(tx, call)
    if (locked) return { row: locked, deliveryIds: [] as string[] }
    const world = { tx, now, deliveries: [] as string[] }
    const outcome = await worldTools[call.name]!.call({ world, personId: person.id }, call.input)
    await touch(world, person.id)
    return { row: (await record(tx, call, outcome, now))!, deliveryIds: world.deliveries }
  })
  await sendDeliveries(services, deliveryIds).catch((error: unknown) =>
    logError('deliveries will be retried', error),
  )
  return answer(row)
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

export async function runBuilderCall(
  services: Services,
  env: Env,
  call: ToolCall,
): Promise<Answer> {
  const { db } = services
  const existing = await stored(db, call)
  if (existing) return answer(existing)
  const draft = await draftOfAgent(services, call.agentID)
  const identity = draft && (await linkedInIdentity(db, draft.userId))
  if (!draft || !identity) return deferred
  const row = await db.transaction(async (tx) => {
    await lock(tx, call)
    const locked = await stored(tx, call)
    if (locked) return locked
    const context = {
      env,
      name: identity.name,
      links: [draft.linkedinUrl],
      saveDraft: (profile: Profile) => saveDraft(tx, draft.userId, call.agentID, profile),
    }
    const outcome = await builderTools[call.name]!.call(context, call.input).catch(failed(call))
    return (await record(tx, call, outcome))!
  })
  return answer(row)
}

const portraitLeaseMs = 5 * 60 * 1000

type Claim =
  | { kind: 'handled'; row: Handled }
  | { kind: 'claimed'; photoUrl: string | null; claimedAt: Date }
  | { kind: 'busy' }

const ownedDraft = (userId: string, call: ToolCall) =>
  and(eq(profileDrafts.userId, userId), eq(profileDrafts.builderAgentId, call.agentID))

export async function claimPortrait(
  db: Database,
  userId: string,
  call: ToolCall,
  now: Date,
): Promise<Claim> {
  return db.transaction(async (tx) => {
    await lock(tx, call)
    const existing = await stored(tx, call)
    if (existing) return { kind: 'handled', row: existing }
    const owned = ownedDraft(userId, call)
    const [claimed] = await tx
      .update(profileDrafts)
      .set({ portraitCallId: call.toolCallID, portraitClaimedAt: now })
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
    return { kind: 'handled', row: (await record(tx, call, refuse(reason), now))! }
  })
}

export async function finishPortrait(
  db: Database,
  userId: string,
  call: ToolCall,
  claimedAt: Date,
  portrait: Uint8Array | null,
  outcome: Outcome,
) {
  return db.transaction(async (tx) => {
    await lock(tx, call)
    const [kept] = await tx
      .update(profileDrafts)
      .set({ portraitClaimedAt: null, ...(portrait && { portrait }) })
      .where(
        and(
          ownedDraft(userId, call),
          eq(profileDrafts.portraitCallId, call.toolCallID),
          eq(profileDrafts.portraitClaimedAt, claimedAt),
          isNull(profileDrafts.profile),
        ),
      )
      .returning({ userId: profileDrafts.userId })
    return kept ? record(tx, call, outcome) : undefined
  })
}

async function runPortraitCall(services: Services, env: Env, call: ToolCall): Promise<Answer> {
  const existing = await stored(services.db, call)
  if (existing) return answer(existing)
  const draft = await draftOfAgent(services, call.agentID)
  if (!draft) return deferred
  const claim = await claimPortrait(services.db, draft.userId, call, new Date())
  if (claim.kind === 'handled') return answer(claim.row)
  if (claim.kind === 'busy') return deferred
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
  const outcome = await portraitTools[call.name]!.call({ draw }, call.input).catch(failed(call))
  const row = await finishPortrait(
    services.db,
    draft.userId,
    call,
    claim.claimedAt,
    portrait,
    outcome,
  )
  return row ? answer(row) : deferred
}

const retryLater =
  (run: ToolHandler): ToolHandler =>
  (call) =>
    run(call).catch((error: unknown) => {
      logError('tool call will be retried', error)
      return deferred
    })

const each = (tools: Record<string, unknown>, run: ToolHandler) =>
  Object.fromEntries(Object.keys(tools).map((name) => [name, retryLater(run)]))

export function toolWorkers(services: Services, env: Env, scheduled: boolean) {
  return {
    world: toolWorker(
      services.omnara,
      env.OMNARA_WORLD_PROFILE_ID,
      each(worldTools, (call) => runWorldCall(services, call)),
    ),
    builder: toolWorker(services.omnara, env.OMNARA_BUILDER_PROFILE_ID, {
      ...each(builderTools, (call) => runBuilderCall(services, env, call)),
      ...(scheduled && each(portraitTools, (call) => runPortraitCall(services, env, call))),
    }),
  }
}
