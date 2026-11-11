import { Link, useParams } from '@tanstack/react-router'
import { useState } from 'react'
import { useWorld } from '../api'
import { useNews } from '../news'
import { Portrait } from './Overlay'
import { Pixel } from './Pixel'

export function Notices({ userId, personId }: { userId: string; personId: string }) {
  const news = useNews(userId)
  const world = useWorld()
  const { conversationId: open } = useParams({ strict: false })
  const [before, setBefore] = useState<ReadonlySet<string> | null>(null)
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set())
  if (before === null && news.mutual) setBefore(new Set(news.mutual.map((match) => match.personId)))
  const dismiss = (key: string) => setDismissed(new Set([...dismissed, key]))
  const people = world.data?.snapshot.people ?? []
  const me = people.find((person) => person.id === personId)
  const partner = me?.conversationId
    ? people.find((person) => person.id !== personId && person.conversationId === me.conversationId)
    : undefined
  const talk = me?.conversationId
  const matches = news.matches.filter(
    (match) => before !== null && !before.has(match.personId) && !dismissed.has(match.personId),
  )
  return (
    <div className="notices" aria-live="polite">
      {matches.map((match) => (
        <div key={match.personId} className="notice match">
          <Portrait person={{ ...match, id: match.personId }} size="small" />
          <span>
            <strong>
              <Pixel name="heart" /> You and {match.name} should meet
            </strong>
            <Link to="/me" search={(previous) => ({ ...previous, tab: 'Matches' })}>
              See why
            </Link>
          </span>
          <button type="button" aria-label="Dismiss" onClick={() => dismiss(match.personId)}>
            ×
          </button>
        </div>
      ))}
      {talk && partner && talk !== open && !dismissed.has(talk) && (
        <div className="notice">
          <i className="talking-dot" />
          <span>
            <strong>Your agent is talking with {partner.name}</strong>
            <Link
              to="/conversations/$conversationId"
              params={{ conversationId: talk }}
              search={true}
            >
              Listen in
            </Link>
          </span>
          <button type="button" aria-label="Dismiss" onClick={() => dismiss(talk)}>
            ×
          </button>
        </div>
      )}
    </div>
  )
}
