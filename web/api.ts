import { QueryClient, useQuery } from '@tanstack/react-query'
import type { MeResponse } from '../shared/api'
import { supabase } from './auth'

export const queryClient = new QueryClient()

supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') queryClient.clear()
})

async function getJson<T>(path: string): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const response = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) throw new Error(`${path} failed with ${response.status}`)
  return (await response.json()) as T
}

export const useMe = (userId: string | undefined) =>
  useQuery({
    queryKey: ['me', userId],
    queryFn: () => getJson<MeResponse>('/api/me'),
    enabled: userId !== undefined,
  })
