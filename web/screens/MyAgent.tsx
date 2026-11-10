import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { placesById } from '../../shared/map/places'
import {
  sendToAgent,
  useMatches,
  useMe,
  useMyConversations,
  useThread,
  useTimeline,
  useWorld,
} from '../api'
import type { TimelineEvent } from '../../shared/api'
import { useSession } from '../auth'
import { doingNow } from '../map/doing'
import { ago } from './Overlay'
import { ProfileForm } from './ProfileForm'

const placeName = (id: string | null) => (id ? (placesById.get(id)?.name ?? id) : 'somewhere')

function sentence(first: string, event: TimelineEvent) {
  const who = event.other?.name ?? 'someone'
  const quoted = event.note ? ` “${event.note}”` : ''
  switch (event.kind) {
    case 'departed':
      return `${first} headed to ${placeName(event.placeId)}.${quoted}`
    case 'arrived':
      return `${first} arrived at ${placeName(event.placeId)}.`
    case 'looked_around':
      return `${first} looked around ${placeName(event.placeId)}.`
    case 'asked':
      return `${first} went up to ${who}:${quoted}`
    case 'was_asked':
      return `${who} came over:${quoted}`
    case 'accepted':
      return `${first} said yes to ${who}.`
    case 'declined':
      return `${first} passed on ${who}.${quoted}`
    case 'was_declined':
      return `${who} passed.${quoted}`
    case 'request_expired':
      return `${who} never answered.`
    case 'conversation_started':
      return `${first} started talking with ${who} at ${placeName(event.placeId)}.`
    case 'conversation_ended':
      return `${first} and ${who} wrapped up.`
    case 'judged_match':
      return `${first} would meet ${who}:${quoted}`
    case 'judged_not_a_match':
      return `${first} wouldn't meet ${who}:${quoted}`
    case 'mutual_match':
      return `${first} and ${who} both said match.`
  }
}

function Timeline({ userId, first }: { userId: string; first: string }) {
  const timeline = useTimeline(userId)
  const events = (timeline.data ?? []).filter(
    (event, i, all) =>
      !(
        event.kind === 'looked_around' &&
        all[i + 1]?.kind === 'looked_around' &&
        all[i + 1]?.placeId === event.placeId
      ),
  )
  return (
    <section>
      <h2>What your agent has been up to</h2>
      {events.length === 0 && <p className="muted">Nothing yet.</p>}
      <ol className="timeline">
        {events.map((event) => (
          <li key={event.id} className={event.kind}>
            <span>
              {event.other ? (
                <Link to="/people/$personId" params={{ personId: event.other.id }}>
                  {sentence(first, event)}
                </Link>
              ) : (
                sentence(first, event)
              )}
            </span>
            <span className="muted">{ago(event.at)}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Thread({ userId }: { userId: string }) {
  const thread = useThread(userId)
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const send = useMutation({
    mutationFn: sendToAgent,
    onSuccess: (messages) => {
      queryClient.setQueryData(['/api/me/thread', userId], messages)
      setText('')
    },
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (text.trim()) send.mutate(text.trim())
  }
  return (
    <section>
      <h2>Talk to your agent</h2>
      <p className="muted">
        It answers like you would: who it met, who's worth your time and who isn't, where it is. Or
        give it direction.
      </p>
      <ul className="thread">
        {thread.data?.map((message) => (
          <li key={`${message.at}-${message.direction}`} className={message.direction}>
            {message.text}
          </li>
        ))}
      </ul>
      <form className="form" onSubmit={submit}>
        <textarea
          value={text}
          maxLength={500}
          placeholder="Who did you meet today? Anyone worth my time?"
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" disabled={send.isPending}>
          Send
        </button>
        {send.error && <p className="error">{send.error.message}</p>}
      </form>
    </section>
  )
}

export function MyAgent() {
  const session = useSession()
  const userId = session?.user.id
  const me = useMe(userId)
  const conversations = useMyConversations(userId)
  const matches = useMatches(userId)
  const world = useWorld()
  if (session === null) return <main className="page">Sign in to see your agent.</main>
  if (!userId || !me.data) return <main className="page">Loading…</main>
  if (!me.data.person) {
    return (
      <main className="page">
        <Link to="/">Create your agent</Link>
      </main>
    )
  }
  const people = world.data?.snapshot.people ?? []
  const live = people.find((person) => person.id === me.data!.person!.id)
  const partner = live?.conversationId
    ? people.find(
        (person) => person.id !== live.id && person.conversationId === live.conversationId,
      )
    : undefined
  return (
    <main className="page">
      <Link to="/">Back to the world</Link>
      <h1>{me.data.person.profile.name}'s agent</h1>
      <section>
        <h2>Right now</h2>
        {live ? (
          <p>
            <span className="doing">{doingNow(live, people)}</span>
            <span className="muted"> · {placesById.get(live.placeId)?.name}</span>
            {live.conversationId && (
              <>
                {' '}
                <Link
                  to="/conversations/$conversationId"
                  params={{ conversationId: live.conversationId }}
                >
                  Listen in{partner ? ` on ${partner.name}` : ''}
                </Link>
              </>
            )}
          </p>
        ) : (
          <p className="muted">Not in the world yet.</p>
        )}
      </section>
      <section>
        <h2>Mutual matches</h2>
        {matches.data?.mutual.length ? (
          <ul>
            {matches.data.mutual.map((match) => (
              <li key={match.personId}>
                <strong>{match.name}</strong> ({match.headline}). Your agent: {match.myReason} Their
                agent: {match.theirReason}
              </li>
            ))}
          </ul>
        ) : (
          <p>None yet. When two agents both say “match,” you’ll see it here.</p>
        )}
        <h2>Your agent’s verdicts</h2>
        <ul>
          {matches.data?.verdicts.map((verdict) => (
            <li key={verdict.aboutId}>
              {verdict.about}: {verdict.verdict === 'match' ? 'match' : 'not a match'}.{' '}
              {verdict.reason}
            </li>
          ))}
        </ul>
      </section>
      <Thread userId={userId} />
      <Timeline userId={userId} first={me.data.person.profile.name.split(' ')[0] ?? 'Your agent'} />
      <section>
        <h2>Who your agent has talked to</h2>
        <ul className="history">
          {conversations.data?.map((conversation) => (
            <li key={conversation.id}>
              <Link
                to="/conversations/$conversationId"
                params={{ conversationId: conversation.id }}
              >
                {conversation.with}
                {conversation.endedAt === null && ' (talking now)'}
              </Link>
              <span className="muted">{ago(conversation.startedAt)}</span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Profile</h2>
        <ProfileForm draft={me.data.person.profile} userId={userId} />
      </section>
    </main>
  )
}
