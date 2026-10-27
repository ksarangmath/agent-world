import { createClient } from '@supabase/supabase-js'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'

const claimsSchema = z.object({
  sub: z.uuid(),
  role: z.literal('authenticated'),
  user_metadata: z
    .object({ name: z.string().max(200).optional(), picture: z.string().max(2000).optional() })
    .optional(),
})

export type SignedIn = {
  Bindings: Env
  Variables: { userId: string; userName: string; photoUrl: string | undefined }
}

export const requireUser = createMiddleware<SignedIn>(async (c, next) => {
  const token = c.req.header('Authorization')?.match(/^Bearer (\S+)$/)?.[1]
  if (!token) throw new HTTPException(401)
  const supabase = createClient(c.env.VITE_SUPABASE_URL, c.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data, error } = await supabase.auth.getClaims(token)
  const claims = claimsSchema.safeParse(data?.claims)
  if (error || !claims.success) throw new HTTPException(401)
  c.set('userId', claims.data.sub)
  c.set('userName', claims.data.user_metadata?.name ?? '')
  c.set('photoUrl', claims.data.user_metadata?.picture)
  await next()
  c.header('Cache-Control', 'private, no-store')
})
