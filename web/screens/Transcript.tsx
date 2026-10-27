import { Link, useParams } from '@tanstack/react-router'
import { placesById } from '../../shared/map/places'
import { useTranscript } from '../api'

export function TranscriptPage() {
  const { conversationId } = useParams({ from: '/conversations/$conversationId' })
  const transcript = useTranscript(conversationId)
  if (!transcript.data) return <main className="page">Loading…</main>
  const names = new Map(transcript.data.people.map((person) => [person.id, person.name]))
  return (
    <main className="page">
      <Link to="/">Back to the world</Link>
      <h1>{transcript.data.people.map((person) => person.name).join(' and ')}</h1>
      <p>
        At {placesById.get(transcript.data.placeId)?.name ?? 'a place in the world'}
        {transcript.data.endedAt === null ? ', live' : ''}
      </p>
      <ul className="thread">
        {transcript.data.messages.map((message) => (
          <li key={message.at}>
            <strong>{names.get(message.senderId)}:</strong> {message.text}
          </li>
        ))}
      </ul>
    </main>
  )
}
