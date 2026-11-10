import { Link, useParams } from '@tanstack/react-router'
import { placesById } from '../../shared/map/places'
import { usePersonCard, useWorld } from '../api'
import { doingNow } from '../map/doing'
import { ago, Overlay, Portrait } from './Overlay'

export function PersonOverlay() {
  const { personId } = useParams({ strict: false })
  const card = usePersonCard(personId ?? '')
  const world = useWorld()
  const people = world.data?.snapshot.people ?? []
  const live = people.find((person) => person.id === personId)
  if (!card.data) {
    return (
      <Overlay label="Person">
        <p className="muted">Loading…</p>
      </Overlay>
    )
  }
  const person = card.data
  return (
    <Overlay label={person.name}>
      <div className="person">
        <Portrait person={person} size="large" />
        <h1>{person.name}</h1>
        <p className="headline">{person.headline}</p>
        {live && (
          <p className="doing">
            {doingNow(live, people)}
            <span className="muted"> · {placesById.get(live.placeId)?.name}</span>
          </p>
        )}
        {person.currentWork && <p>{person.currentWork}</p>}
        {person.interests.length > 0 && (
          <ul className="chips">
            {person.interests.map((interest) => (
              <li key={interest}>{interest}</li>
            ))}
          </ul>
        )}
        <div className="actions">
          {person.conversationId && (
            <Link
              to="/conversations/$conversationId"
              params={{ conversationId: person.conversationId }}
              search={true}
              className="big primary"
            >
              Listen in
            </Link>
          )}
          {person.linkedin && (
            <a
              className="big linkedin"
              href={person.linkedin}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="mark" aria-hidden="true">
                in
              </span>
              LinkedIn
            </a>
          )}
        </div>
        {person.conversations.length > 0 && (
          <>
            <h2>Conversations</h2>
            <ul className="history">
              {person.conversations.map((conversation) => (
                <li key={conversation.id}>
                  <Link
                    to="/conversations/$conversationId"
                    params={{ conversationId: conversation.id }}
                    search={true}
                  >
                    with {conversation.with}
                  </Link>
                  <span className="muted">{ago(conversation.startedAt)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Overlay>
  )
}
