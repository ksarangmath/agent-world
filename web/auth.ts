import { createClient, type Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { here } from './metro'

const env = z
  .object({ VITE_SUPABASE_URL: z.url(), VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(1) })
  .parse(import.meta.env)

export const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { flowType: 'pkce' },
})

const returnTo = 'agent-world:return-to'

export const signIn = () => {
  sessionStorage.setItem(returnTo, here.path)
  return supabase.auth.signInWithOAuth({
    provider: 'linkedin_oidc',
    options: {
      queryParams: { enable_extended_login: 'true' },
      ...(here.path && { redirectTo: `${location.origin}${here.path}/` }),
    },
  })
}

supabase.auth.onAuthStateChange((_event, session) => {
  if (!session) return
  const path = sessionStorage.getItem(returnTo)
  sessionStorage.removeItem(returnTo)
  if (path !== null && path !== here.path) location.replace(`${path}/`)
})

export const signOut = () => supabase.auth.signOut()

export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])
  return session
}
