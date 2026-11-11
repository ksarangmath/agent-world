import { expect, test } from 'vitest'
import type { Matches, ThreadMessage } from '../shared/api'
import { seenFrom, unseen } from './news'

const match = (personId: string, at: string) => ({ personId, at }) as Matches['mutual'][number]
const matches = {
  verdicts: [],
  mutual: [match('a', '2026-11-11T08:00:00.000Z'), match('b', '2026-11-11T09:30:00.000Z')],
} as Matches
const thread: ThreadMessage[] = [
  { direction: 'to_agent', text: 'who did you meet?', at: '2026-11-11T09:00:00.000Z' },
  { direction: 'to_owner', text: 'two people', at: '2026-11-11T09:00:05.000Z' },
  { direction: 'to_owner', text: 'one more', at: '2026-11-11T10:00:00.000Z' },
]

test('everything is new to someone who has never looked', () => {
  const news = unseen(matches, thread, seenFrom(''))
  expect(news.matches.map((one) => one.personId)).toEqual(['a', 'b'])
  expect(news.replies).toBe(2)
  expect(news).toMatchObject({
    latestMatch: '2026-11-11T09:30:00.000Z',
    latestReply: '2026-11-11T10:00:00.000Z',
  })
})

test('only what arrived after the last look counts, and your own messages never do', () => {
  const seen = seenFrom(
    JSON.stringify({ matches: '2026-11-11T08:00:00.000Z', chat: '2026-11-11T09:00:05.000Z' }),
  )
  const news = unseen(matches, thread, seen)
  expect(news.matches.map((one) => one.personId)).toEqual(['b'])
  expect(news.replies).toBe(1)
})

test('the newest reply is the latest by time, whatever order the thread arrives in', () => {
  const shuffled = [thread[2]!, thread[0]!, thread[1]!]
  expect(unseen(matches, shuffled, seenFrom('')).latestReply).toBe('2026-11-11T10:00:00.000Z')
})

test('a damaged or foreign stored value counts as never looked', () => {
  expect(seenFrom('{"matches":5,"chat":null}')).toEqual({ matches: '', chat: '' })
  expect(seenFrom('not json')).toEqual({ matches: '', chat: '' })
  expect(unseen(undefined, undefined, seenFrom(''))).toMatchObject({ matches: [], replies: 0 })
})
