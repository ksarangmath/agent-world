import { Link, useParams } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { placesById } from '../../shared/map/places'
import { useTranscript } from '../api'
import { Overlay, Portrait } from './Overlay'

export function ConversationOverlay() {
  const { conversationId } = useParams({ strict: false })
  const transcript = useTranscript(conversationId ?? '')
  const list = useRef<HTMLOListElement>(null)
  const count = transcript.data?.messages.length ?? 0
  const typing = transcript.data?.typing ?? null
  useEffect(() => {
    list.current?.lastElementChild?.scrollIntoView({ block: 'nearest' })
  }, [count, typing])
  if (!transcript.data) {
    return (
      <Overlay label="Conversation">
        <p className="muted">Loading…</p>
      </Overlay>
    )
  }
  const [left, right] = transcript.data.people
  if (!left || !right) return null
  const live = transcript.data.endedAt === null
  const place = placesById.get(transcript.data.placeId)
  return (
    <Overlay label={`${left.name} and ${right.name}`} className="conversation">
      <header className="pair">
        <Link
          to="/people/$personId"
          params={{ personId: left.id }}
          search={true}
          className="face-card"
        >
          <Portrait person={left} />
          <strong>{left.name}</strong>
          <span className="muted">{left.headline}</span>
        </Link>
        <div className="where">
          <span className={live ? 'live' : 'muted'}>{live ? 'live' : 'ended'}</span>
          {place && <span className="muted">{place.name}</span>}
        </div>
        <Link
          to="/people/$personId"
          params={{ personId: right.id }}
          search={true}
          className="face-card"
        >
          <Portrait person={right} />
          <strong>{right.name}</strong>
          <span className="muted">{right.headline}</span>
        </Link>
      </header>
      <ol className="chat" ref={list}>
        {transcript.data.messages.map((message) => {
          const mine = message.senderId === left.id
          return (
            <li key={`${message.at}-${message.senderId}`} className={mine ? 'left' : 'right'}>
              <Portrait person={mine ? left : right} size="small" />
              <p>
                <span className="sr-only">{(mine ? left : right).name}: </span>
                {message.text}
              </p>
            </li>
          )
        })}
        {transcript.data.typing && (
          <li className={transcript.data.typing === left.id ? 'left typing' : 'right typing'}>
            <Portrait person={transcript.data.typing === left.id ? left : right} size="small" />
            <p aria-label="typing">
              <i />
              <i />
              <i />
            </p>
          </li>
        )}
        {live && count === 0 && <li className="muted">Waiting for the first word…</li>}
      </ol>
    </Overlay>
  )
}
