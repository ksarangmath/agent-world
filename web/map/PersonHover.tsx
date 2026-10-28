import { useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { usePersonCard } from '../api'
import { placesById } from '../../shared/map/places'
import { Portrait } from '../humanoid/Portrait'
import { hovered, type Hover } from './hover'

const gap = 14

function Card({ hover }: { hover: Hover }) {
  const card = usePersonCard(hover.id)
  const place = placesById.get(hover.placeId)
  const element = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const box = element.current!
    const [width, height] = [box.offsetWidth, box.offsetHeight]
    const left = hover.x + gap + width > innerWidth ? hover.x - gap - width : hover.x + gap
    const top = hover.y + gap + height > innerHeight ? hover.y - gap - height : hover.y + gap
    box.style.left = `${Math.max(0, left)}px`
    box.style.top = `${Math.max(0, top)}px`
  })
  return (
    <div ref={element} className="hover-card">
      {card.data && <Portrait avatar={card.data.avatar} className="portrait" />}
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
