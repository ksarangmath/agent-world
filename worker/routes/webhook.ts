import { Hono } from 'hono'
import { database } from '../db/client'
import { omnara } from '../omnara/client'
import { verifyWebhook } from '../omnara/webhook'
import { toolWorkers } from '../tools/run'

export const webhook = new Hono<{ Bindings: Env }>().post('/', async (c) => {
  const payload = await verifyWebhook(
    c.env.OMNARA_WEBHOOK_SECRET,
    await c.req.text(),
    c.req.raw.headers,
  )
  if (!payload) return c.text('invalid webhook', 400)
  if (payload.event === 'tool_call_update') {
    const services = { db: database(c.env), omnara: omnara(c.env) }
    const handling = Object.values(toolWorkers(services, c.env, false)).map((worker) =>
      worker.handle(payload.data),
    )
    c.executionCtx.waitUntil(Promise.allSettled(handling))
  }
  return c.body(null, 204)
})
