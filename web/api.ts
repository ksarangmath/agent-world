import { QueryClient, useMutation, useQuery } from '@tanstack/react-query'
import {
  pageSize,
  type Matches,
  type MeResponse,
  type MyConversation,
  type OnboardingStatus,
  type PersonCard,
  type ThreadMessage,
  type TimelineEvent,
  type Transcript,
  type WorldSnapshot,
} from '../shared/api'
import type { Editable } from '../shared/profile'
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
    refetchInterval: 60_000,
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

async function send<T>(
  path: string,
  method: 'POST' | 'PUT' | 'DELETE',
  body?: unknown,
): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const response = await fetch(path, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => {
    throw new Error('The connection dropped before we got an answer. Try again.')
  })
  const json = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) {
    throw Object.assign(new Error(json.error ?? `${path} failed with ${response.status}`), {
      status: response.status,
    })
  }
  return json as T
}

export const useOnboarding = (userId: string | undefined) =>
  useQuery({
    queryKey: ['onboarding', userId],
    queryFn: () => getJson<OnboardingStatus>('/api/onboarding'),
    enabled: userId !== undefined,
    refetchInterval: (query) => (query.state.data?.status === 'building' ? 3000 : false),
  })

export const startOnboarding = (linkedin: string) =>
  send<OnboardingStatus>('/api/onboarding', 'POST', { linkedin, consent: true })

export const saveProfile = (edits: Editable) => send<unknown>('/api/me/profile', 'PUT', edits)

export const deleteAccount = () => send<unknown>('/api/me', 'DELETE')

export const usePrivate = <T>(path: string, userId: string | undefined, refetchInterval = 5000) =>
  useQuery({
    queryKey: [path, userId],
    queryFn: () => getJson<T>(path),
    enabled: userId !== undefined,
    refetchInterval,
  })

type History<T> = { items: T[]; more: boolean }

function useHistory<T extends { id: string | number }>(
  path: string,
  userId: string,
  at: (item: T) => string,
  cursor: (oldest: T) => string,
) {
  const key = ['history', path, userId]
  const newestFirst = (a: T, b: T) => {
    const [first, second] = [at(a), at(b)]
    if (first !== second) return first < second ? 1 : -1
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
  }
  const merged = (known: T[], page: T[]) =>
    [...new Map([...known, ...page].map((item) => [item.id, item])).values()].sort(newestFirst)
  const history = useQuery({
    queryKey: key,
    queryFn: async (): Promise<History<T>> => {
      const page = await getJson<T[]>(path)
      const known = queryClient.getQueryData<History<T>>(key)
      return {
        items: merged(known?.items ?? [], page),
        more: known ? known.more : page.length >= pageSize,
      }
    },
    refetchInterval: 5000,
  })
  const earlier = useMutation({
    mutationFn: (before: string) => getJson<T[]>(`${path}?before=${encodeURIComponent(before)}`),
    onSuccess: (page) =>
      queryClient.setQueryData<History<T>>(key, (known) => ({
        items: merged(known?.items ?? [], page),
        more: page.length >= pageSize,
      })),
  })
  const items = history.data?.items ?? []
  const oldest = items.at(-1)
  return {
    items,
    loaded: history.data !== undefined,
    more: history.data?.more === true && oldest !== undefined,
    loading: earlier.isPending,
    failed: earlier.isError,
    showEarlier: () => oldest && earlier.mutate(cursor(oldest)),
  }
}

export const useMyConversations = (userId: string) =>
  useHistory<MyConversation>(
    '/api/me/conversations',
    userId,
    (conversation) => conversation.startedAt,
    (oldest) => oldest.startedAt,
  )
export const useMatches = (userId: string | undefined, every?: number) =>
  usePrivate<Matches>('/api/me/matches', userId, every)
export const useTimeline = (userId: string) =>
  useHistory<TimelineEvent>(
    '/api/me/timeline',
    userId,
    (event) => event.at,
    (oldest) => `${oldest.at}_${oldest.id}`,
  )
export const useThread = (userId: string | undefined, every?: number) =>
  usePrivate<ThreadMessage[]>('/api/me/thread', userId, every)

export const wakeUp = () => send<{ awakeUntil: string }>('/api/me/wake', 'POST', {})

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

export const useMyPortrait = (userId: string | undefined) =>
  useQuery({
    queryKey: ['my-portrait', userId],
    enabled: userId !== undefined,
    queryFn: async () => {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      const response = await fetch('/api/me/portrait', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (response.status === 404) return null
      if (!response.ok) throw new Error(`/api/me/portrait failed with ${response.status}`)
      return URL.createObjectURL(await response.blob())
    },
    staleTime: Infinity,
  })
