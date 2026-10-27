import { Link, useParams } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'
import { usePersonCard } from '../api'

const Preview = lazy(() => import('../humanoid/Preview'))

export function PersonCardPage() {
  const { personId } = useParams({ from: '/people/$personId' })
  const card = usePersonCard(personId)
  if (!card.data) return <main className="page">Loading…</main>
  return (
    <main className="page">
      <Link to="/">Back to the world</Link>
      <div className="preview">
        <Suspense>
          <Preview avatar={card.data.avatar} />
        </Suspense>
      </div>
      <h1>{card.data.name}</h1>
      <p>{card.data.headline}</p>
      {card.data.currentWork && <p>Working on: {card.data.currentWork}</p>}
      <p>Interests: {card.data.interests.join(', ')}</p>
      {card.data.conversationId && (
        <p>
          <Link
            to="/conversations/$conversationId"
            params={{ conversationId: card.data.conversationId }}
          >
            Talking now
          </Link>
        </p>
      )}
      <h2>Conversations</h2>
      <ul>
        {card.data.conversations.map((conversation) => (
          <li key={conversation.id}>
            <Link to="/conversations/$conversationId" params={{ conversationId: conversation.id }}>
              With {conversation.with}
            </Link>{' '}
            {new Date(conversation.startedAt).toLocaleString()}
          </li>
        ))}
      </ul>
    </main>
  )
}
