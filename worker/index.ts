import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { HTTPException } from 'hono/http-exception'
import { logError } from './log'
import { me } from './routes/me'
import { onboarding } from './routes/onboarding'
import { personPage } from './routes/preview'
import { webhook } from './routes/webhook'
import { conversation, person, portrait, world } from './routes/world'
import { scheduled } from './scheduled'

const api = new Hono<{ Bindings: Env }>()
  .use(bodyLimit({ maxSize: 64 * 1024 }))
  .route('/me', me)
  .route('/onboarding', onboarding)
  .route('/world', world)
  .route('/conversations', conversation)
  .route('/people', person)
  .route('/portraits', portrait)
  .route('/omnara/webhook', webhook)
  .onError((error, c) => {
    if (error instanceof HTTPException) return error.getResponse()
    logError('request failed', error)
    return c.json({ error: 'Something went wrong.' }, 500)
  })

export const app = new Hono<{ Bindings: Env }>().route('/api', api).route('/people', personPage)

export default { fetch: app.fetch, scheduled } satisfies ExportedHandler<Env>
