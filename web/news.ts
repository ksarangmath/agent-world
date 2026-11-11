import { useMemo, useSyncExternalStore } from 'react'
import type { Matches, ThreadMessage } from '../shared/api'
import { useMatches, useThread } from './api'

export type Seen = { matches: string; chat: string }

const everyMs = 20_000
const listeners = new Set<() => void>()
const key = (userId: string) => `seen:${userId}`

function stored(userId: string) {
  try {
    return localStorage.getItem(key(userId)) ?? ''
  } catch {
    return ''
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function seenFrom(raw: string): Seen {
  try {
    const { matches, chat } = JSON.parse(raw) as Partial<Seen>
    return {
      matches: typeof matches === 'string' ? matches : '',
      chat: typeof chat === 'string' ? chat : '',
    }
  } catch {
    return { matches: '', chat: '' }
  }
}

export function markSeen(userId: string, part: keyof Seen, at: string) {
  const seen = seenFrom(stored(userId))
  if (at <= seen[part]) return
  try {
    localStorage.setItem(key(userId), JSON.stringify({ ...seen, [part]: at }))
  } catch {
    return
  }
  for (const listener of listeners) listener()
}

export function unseen(
  matches: Matches | undefined,
  thread: ThreadMessage[] | undefined,
  seen: Seen,
) {
  const mutual = matches?.mutual ?? []
  const replies = (thread ?? []).filter((message) => message.direction === 'to_owner')
  return {
    matches: mutual.filter((match) => match.at > seen.matches),
    replies: replies.filter((message) => message.at > seen.chat).length,
    latestMatch: mutual.reduce((latest, match) => (match.at > latest ? match.at : latest), ''),
    latestReply: replies.reduce((latest, reply) => (reply.at > latest ? reply.at : latest), ''),
  }
}

export function useNews(userId: string | undefined) {
  const matches = useMatches(userId, everyMs)
  const thread = useThread(userId, everyMs)
  const raw = useSyncExternalStore(subscribe, () => (userId ? stored(userId) : ''))
  return useMemo(
    () => ({ ...unseen(matches.data, thread.data, seenFrom(raw)), mutual: matches.data?.mutual }),
    [matches.data, thread.data, raw],
  )
}
