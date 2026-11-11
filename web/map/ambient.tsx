import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { WorldPerson } from '../../shared/api'
import { placesById } from '../../shared/map/places'
import { glideTo, stopFlight } from './camera'
import { touring } from './watching'

const dwellMs = 12_000
const closeUp = 34

export function Ambient({ people }: { people: WorldPerson[] }) {
  const drift = useRef({ nextAt: 0, stop: 0, gliding: false })
  useEffect(
    () =>
      touring.subscribe(() => {
        if (drift.current.gliding) stopFlight()
        Object.assign(drift.current, { nextAt: 0, gliding: false })
      }),
    [],
  )
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
    if (!touring.get()) return
    if (document.querySelector('.overlay')) {
      if (state.gliding) stopFlight()
      Object.assign(state, { gliding: false, nextAt: 0 })
      return
    }
    if (now < state.nextAt || stops.length === 0) return
    const stop = stops[state.stop++ % stops.length]!
    state.gliding = true
    state.nextAt = now + dwellMs + glideTo(stop.x, stop.y, closeUp) * 1000
  })
  return null
}
