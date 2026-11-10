import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, type ReactNode } from 'react'

export function Overlay({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  const navigate = useNavigate()
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    panel.current?.focus()
  }, [])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void navigate({ to: '/', search: true })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])
  return (
    <aside
      ref={panel}
      tabIndex={-1}
      className={className ? `overlay ${className}` : 'overlay'}
      aria-label={label}
    >
      <Link to="/" search={true} className="close" aria-label="Back to the map">
        ×
      </Link>
      {children}
    </aside>
  )
}

export function Portrait({
  person,
  size = 'medium',
}: {
  person: { id: string; name: string; portrait: boolean }
  size?: 'small' | 'medium' | 'large'
}) {
  if (person.portrait) {
    return <img className={`face ${size}`} src={`/api/portraits/${person.id}`} alt="" />
  }
  return (
    <span className={`face ${size} blank`} aria-hidden="true">
      {person.name.slice(0, 1)}
    </span>
  )
}

export function ago(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}
