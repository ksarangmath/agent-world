import { Hono } from 'hono'
import { me } from './routes/me'

const app = new Hono<{ Bindings: Env }>().basePath('/api').route('/me', me)

export default app
