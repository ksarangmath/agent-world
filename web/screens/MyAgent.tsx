import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { sendToAgent, useMatches, useMe, useMyConversations, useThread } from '../api'
import { useSession } from '../auth'
import { ProfileForm } from './ProfileForm'

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
      <h2>You and your agent</h2>
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
          placeholder="Give your agent direction, like “find people building devtools”"
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
  if (session === null) return <main className="page">Sign in to see your agent.</main>
  if (!userId || !me.data) return <main className="page">Loading…</main>
  if (!me.data.person) {
    return (
      <main className="page">
        <Link to="/onboarding">Create your agent</Link>
      </main>
    )
  }
  return (
    <main className="page">
      <Link to="/">Back to the world</Link>
      <h1>{me.data.person.profile.name}'s agent</h1>
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
      <section>
        <h2>Conversations</h2>
        <ul>
          {conversations.data?.map((conversation) => (
            <li key={conversation.id}>
              <Link
                to="/conversations/$conversationId"
                params={{ conversationId: conversation.id }}
              >
                With {conversation.with}
              </Link>{' '}
              {new Date(conversation.startedAt).toLocaleString()}
              {conversation.endedAt === null && ' (live)'}
            </li>
          ))}
        </ul>
      </section>
      <Thread userId={userId} />
      <section>
        <h2>Profile</h2>
        <ProfileForm draft={me.data.person.profile} userId={userId} />
      </section>
    </main>
  )
}
