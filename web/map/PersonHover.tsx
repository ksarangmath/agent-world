import { useSyncExternalStore } from 'react'
import { usePersonCard } from '../api'
import { placesById } from '../../shared/map/places'
import { hovered, type Hover } from './hover'

function Card({ hover }: { hover: Hover }) {
  const card = usePersonCard(hover.id)
  const place = placesById.get(hover.placeId)
  return (
    <div className="hover-card" style={{ left: hover.x + 14, top: hover.y + 14 }}>
      <strong>{hover.name}</strong>
      {card.data && <span>{card.data.headline}</span>}
      {place && <span className="muted">At {place.name}</span>}
      {card.data?.conversationId && <span className="talking">Talking now</span>}
      {card.data && card.data.interests.length > 0 && (
        <span className="muted">{card.data.interests.slice(0, 4).join(' · ')}</span>
      )}
    </div>
  )
}

export function PersonHover() {
  const hover = useSyncExternalStore(hovered.subscribe, hovered.get)
  return hover ? <Card hover={hover} /> : null
}
