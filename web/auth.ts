import { createClient, type Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { z } from 'zod'

const env = z
  .object({ VITE_SUPABASE_URL: z.url(), VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(1) })
  .parse(import.meta.env)

export const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { flowType: 'pkce' },
})

export const signIn = () => supabase.auth.signInWithOAuth({ provider: 'linkedin_oidc' })

export const signOut = () => supabase.auth.signOut()

export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])
  return session
}
