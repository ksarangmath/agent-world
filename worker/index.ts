import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { HTTPException } from 'hono/http-exception'
import { logError } from './log'
import { me } from './routes/me'
import { onboarding } from './routes/onboarding'
import { webhook } from './routes/webhook'
import { conversation, person, world } from './routes/world'
import { scheduled } from './scheduled'

export const app = new Hono<{ Bindings: Env }>()
  .basePath('/api')
  .use(bodyLimit({ maxSize: 64 * 1024 }))
  .route('/me', me)
  .route('/onboarding', onboarding)
  .route('/world', world)
  .route('/conversations', conversation)
  .route('/people', person)
  .route('/omnara/webhook', webhook)
  .onError((error, c) => {
    if (error instanceof HTTPException) return error.getResponse()
    logError('request failed', error)
    return c.json({ error: 'Something went wrong.' }, 500)
  })

export default { fetch: app.fetch, scheduled } satisfies ExportedHandler<Env>
