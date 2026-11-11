import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { WorldPerson } from '../../shared/api'
import { placesById } from '../../shared/map/places'
import { glideTo, stopFlight } from './camera'

const idleBeforeMs = 60_000
const dwellMs = 12_000
const closeUp = 34
const inputs = ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart'] as const
const calm = matchMedia('(prefers-reduced-motion: reduce)')

export function Ambient({ people }: { people: WorldPerson[] }) {
  const drift = useRef({ touchedAt: 0, nextAt: 0, stop: 0, gliding: false })
  useEffect(() => {
    const state = drift.current
    state.touchedAt = performance.now()
    const touch = () => {
      state.touchedAt = performance.now()
      if (state.gliding) stopFlight()
      state.gliding = false
    }
    inputs.forEach((type) => window.addEventListener(type, touch, { passive: true }))
    return () => inputs.forEach((type) => window.removeEventListener(type, touch))
  }, [])
  const stops = useMemo(() => {
    const talks = new Map<string, WorldPerson[]>()
    const crowds = new Map<string, number>()
    for (const person of people) {
      if (person.trip) continue
      crowds.set(person.placeId, (crowds.get(person.placeId) ?? 0) + 1)
      if (!person.conversationId) continue
      talks.set(person.conversationId, [...(talks.get(person.conversationId) ?? []), person])
    }
    return [
      ...[...talks.values()].map((pair) => ({
        x: pair.reduce((sum, person) => sum + person.tile.x, 0) / pair.length + 0.5,
        y: pair.reduce((sum, person) => sum + person.tile.y, 0) / pair.length + 0.5,
      })),
      ...[...crowds]
        .filter(([, here]) => here > 1)
        .sort((a, b) => b[1] - a[1])
        .map(([placeId]) => {
          const { center } = placesById.get(placeId)!
          return { x: center.x + 0.5, y: center.y + 0.5 }
        }),
    ]
  }, [people])
  useFrame(() => {
    const state = drift.current
    const now = performance.now()
    if (now - state.touchedAt < idleBeforeMs) return
    if (calm.matches || document.querySelector('.overlay')) {
      if (state.gliding) stopFlight()
      state.gliding = false
      return
    }
    if (now < state.nextAt || stops.length === 0) return
    const stop = stops[state.stop++ % stops.length]!
    state.gliding = true
    state.nextAt = now + dwellMs + glideTo(stop.x, stop.y, closeUp) * 1000
  })
  return null
}
