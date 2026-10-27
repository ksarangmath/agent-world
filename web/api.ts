import { QueryClient, useQuery } from '@tanstack/react-query'
import type {
  Matches,
  MeResponse,
  MyConversation,
  OnboardingStatus,
  PersonCard,
  ThreadMessage,
  Transcript,
  WorldSnapshot,
} from '../shared/api'
import type { Profile } from '../shared/profile'
import { supabase } from './auth'

export const queryClient = new QueryClient()

supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') queryClient.clear()
})

async function getJson<T>(path: string, signedIn = true): Promise<T> {
  const token = signedIn ? (await supabase.auth.getSession()).data.session?.access_token : undefined
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

export const useWorld = () =>
  useQuery({
    queryKey: ['world'],
    queryFn: async () => {
      const snapshot = await getJson<WorldSnapshot>('/api/world', false)
      return { snapshot, serverOffsetMs: Date.parse(snapshot.now) - Date.now() }
    },
    refetchInterval: 1000,
  })

async function send<T>(path: string, method: 'POST' | 'PUT', body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const response = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  const json = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) throw new Error(json.error ?? `${path} failed with ${response.status}`)
  return json as T
}

export const useOnboarding = (userId: string | undefined) =>
  useQuery({
    queryKey: ['onboarding', userId],
    queryFn: () => getJson<OnboardingStatus>('/api/onboarding'),
    enabled: userId !== undefined,
    refetchInterval: (query) => (query.state.data?.status === 'building' ? 3000 : false),
  })

export const startOnboarding = (links: string[]) =>
  send<OnboardingStatus>('/api/onboarding', 'POST', { links, consent: true })

export const saveProfile = (profile: Profile) => send<unknown>('/api/me/profile', 'PUT', profile)

export const usePrivate = <T>(path: string, userId: string | undefined, refetchInterval = 5000) =>
  useQuery({
    queryKey: [path, userId],
    queryFn: () => getJson<T>(path),
    enabled: userId !== undefined,
    refetchInterval,
  })

export const useMyConversations = (userId: string | undefined) =>
  usePrivate<MyConversation[]>('/api/me/conversations', userId)
export const useMatches = (userId: string | undefined) =>
  usePrivate<Matches>('/api/me/matches', userId)
export const useThread = (userId: string | undefined) =>
  usePrivate<ThreadMessage[]>('/api/me/thread', userId)

export const sendToAgent = (text: string) =>
  send<ThreadMessage[]>('/api/me/thread', 'POST', { text })

export const useTranscript = (id: string) =>
  useQuery({
    queryKey: ['conversation', id],
    queryFn: () => getJson<Transcript>(`/api/conversations/${id}`, false),
    refetchInterval: 1000,
  })

export const usePersonCard = (id: string) =>
  useQuery({
    queryKey: ['person', id],
    queryFn: () => getJson<PersonCard>(`/api/people/${id}`, false),
    refetchInterval: 3000,
  })
