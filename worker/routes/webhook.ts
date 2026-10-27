import { Hono } from 'hono'
import { database } from '../db/client'
import { omnara } from '../omnara/client'
import { readyCustomCalls } from '../omnara/tool-calls'
import { verifyWebhook } from '../omnara/webhook'
import { logError } from '../log'
import { draftOfAgent } from '../profile/builder'
import { personOfAgent, runBuilderCall, runToolCall } from '../tools/run'

export const webhook = new Hono<{ Bindings: Env }>().post('/', async (c) => {
  const payload = verifyWebhook(c.env.OMNARA_WEBHOOK_SECRET, await c.req.text(), c.req.header())
  if (!payload) return c.text('invalid webhook', 400)
  if (payload.event !== 'tool_call_update' || payload.data.state !== 'ready')
    return c.body(null, 204)
  const agentId = payload.data.agent_id
  if (!agentId) return c.body(null, 204)
  const services = { db: database(c.env), omnara: omnara(c.env) }
  const toolCallId = payload.data.tool_call_id
  const handle = async () => {
    const person = await personOfAgent(services.db, agentId)
    const draft = person ? undefined : await draftOfAgent(services, agentId)
    if (!person && !draft) return
    const calls = await readyCustomCalls(services.omnara, agentId)
    const call = calls.find((candidate) => candidate.id === toolCallId)
    if (call && person) await runToolCall(services, person.id, call)
    if (call && draft) await runBuilderCall(services, c.env, draft, call)
  }
  c.executionCtx.waitUntil(
    handle().catch((error: unknown) => logError('webhook tool call failed', error)),
  )
  return c.body(null, 204)
})
