import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, test } from 'vitest'
import { placesById } from '../../shared/map/places'
import { spots } from '../../shared/map/spots'
import type { Profile } from '../../shared/profile'
import * as schema from '../db/schema'
import { deferred } from '../omnara/tool-calls'
import { runWorldCall, sendDeliveries } from './run'

const client = postgres('postgresql://postgres:postgres@127.0.0.1:54322/postgres', { max: 8 })
const db = drizzle(client, { schema, casing: 'snake_case' })
afterAll(() => client.end())

const { people, handledToolCalls, worldEvents } = schema
const services = { db, omnara: {} as never }
const agentID = 'agent-runner'
const call = (toolCallID: string, name: string, input: Record<string, unknown>) => ({
  agentID,
  toolCallID,
  name,
  input,
})
const goTo = (toolCallID: string) =>
  call(toolCallID, 'go_to', { place_id: 'lands-end-lookout', reason: 'the view' })

beforeEach(async () => {
  await db.execute(sql`truncate people, handled_tool_calls, deliveries, world_events cascade`)
  await db.execute(sql`delete from auth.users`)
  const userId = crypto.randomUUID()
  await db.execute(sql`insert into auth.users (id) values (${userId})`)
  const spot = spots(placesById.get('dogpatch-robotics')!)[0]!
  await db.insert(people).values({
    userId,
    profile: { name: 'Runner', interests: ['robotics'] } as Profile,
    agentId: agentID,
    placeId: 'dogpatch-robotics',
    tileX: spot.x,
    tileY: spot.y,
    awakeUntil: new Date('2099-01-01T00:00:00Z'),
  })
})

const trips = async () =>
  (await db.select({ kind: worldEvents.kind }).from(worldEvents)).filter(
    (event) => event.kind === 'arrived',
  ).length

describe('delayed deliveries', () => {
  test('a delivery that is already due but still pending gets a background drain', async () => {
    const [person] = await db
      .select({ id: people.id })
      .from(people)
      .where(eq(people.agentId, agentID))
    const [row] = await db
      .insert(schema.deliveries)
      .values({
        personId: person!.id,
        text: '[world] {"event":"nudge"}',
        mode: 'queued',
        dueAt: new Date(Date.now() - 1000),
      })
      .returning({ id: schema.deliveries.id })
    const tasks: Promise<unknown>[] = []
    await sendDeliveries(services, [row!.id], (task) => void tasks.push(task))
    expect(tasks).toHaveLength(1)
    await Promise.allSettled(tasks)
  })
})

describe('running world tool calls', () => {
  test('a repeated call returns the stored result without acting twice', async () => {
    const [first, second] = await Promise.all([
      runWorldCall(services, call('tc-look', 'look_around', {})),
      runWorldCall(services, call('tc-look', 'look_around', {})),
    ])
    expect(first).not.toBe(deferred)
    expect(second).toEqual(first)
    expect(await db.select().from(handledToolCalls)).toHaveLength(1)
  })

  test('a trip is deferred until arrival, then answers with its stored result', async () => {
    expect(await runWorldCall(services, goTo('tc-trip'))).toBe(deferred)
    expect(await runWorldCall(services, goTo('tc-trip'))).toBe(deferred)
    expect(await trips()).toBe(1)
    await db
      .update(handledToolCalls)
      .set({ dueAt: new Date(Date.now() - 1000) })
      .where(eq(handledToolCalls.toolCallId, 'tc-trip'))
    const arrived = await runWorldCall(services, goTo('tc-trip'))
    expect(arrived).toMatchObject({ outcome: 'succeeded' })
    expect(await trips()).toBe(1)
  })

  test('a call from an agent with no person yet is deferred and changes nothing', async () => {
    const stranger = { ...call('tc-stranger', 'look_around', {}), agentID: 'agent-unknown' }
    expect(await runWorldCall(services, stranger)).toBe(deferred)
    expect(await db.select().from(handledToolCalls)).toHaveLength(0)
  })
})
