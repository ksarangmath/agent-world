import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { database } from '../db/client'
import { z } from 'zod'
import { personCard, portraitOf, transcript } from '../world/reads'
import { worldSnapshot } from '../world/snapshot'

const publicForOneSecond = createMiddleware(async (c, next) => {
  await next()
  c.header('Cache-Control', 'public, max-age=1')
})

export const world = new Hono<{ Bindings: Env }>()
  .use(publicForOneSecond)
  .get('/', async (c) => c.json(await worldSnapshot(database(c.env), new Date())))

export const conversation = new Hono<{ Bindings: Env }>()
  .use(publicForOneSecond)
  .get('/:id', async (c) => {
    const id = c.req.param('id')
    if (!z.uuid().safeParse(id).success) return c.notFound()
    const found = await transcript(database(c.env), id)
    return found ? c.json(found) : c.notFound()
  })

export const person = new Hono<{ Bindings: Env }>()
  .use(publicForOneSecond)
  .get('/:id', async (c) => {
    const id = c.req.param('id')
    if (!z.uuid().safeParse(id).success) return c.notFound()
    const found = await personCard(database(c.env), id)
    return found ? c.json(found) : c.notFound()
  })

export const portrait = new Hono<{ Bindings: Env }>().get('/:id', async (c) => {
  const id = c.req.param('id')
  if (!z.uuid().safeParse(id).success) return c.notFound()
  const image = await portraitOf(database(c.env), id)
  if (!image) return c.notFound()
  return c.body(new Uint8Array(image), 200, {
    'Content-Type': 'image/webp',
    'Cache-Control': 'public, max-age=300',
  })
})
