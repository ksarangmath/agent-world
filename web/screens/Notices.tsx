import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useNews } from '../news'
import { Portrait } from './Overlay'
import { Pixel } from './Pixel'

export function Notices({ userId }: { userId: string }) {
  const news = useNews(userId)
  const [before, setBefore] = useState<ReadonlySet<string> | null>(null)
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set())
  if (before === null && news.mutual) setBefore(new Set(news.mutual.map((match) => match.personId)))
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
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setDismissed(new Set([...dismissed, match.personId]))}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
