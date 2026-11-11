function store<T>(initial: T) {
  let current = initial
  const listeners = new Set<() => void>()
  return {
    get: () => current,
    set(next: T) {
      if (next === current) return
      current = next
      for (const listener of listeners) listener()
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export type Hover = {
  id: string
  name: string
  placeId: string
  doing: string
  x: number
  y: number
}

export const hovered = store<Hover | null>(null)
export const following = store<{ id: string; name: string } | null>(null)
export const touring = store(false)

export function follow(person: { id: string; name: string }) {
  touring.set(false)
  following.set(person)
}

export function tour(on: boolean) {
  if (on) following.set(null)
  touring.set(on)
}

export function steer() {
  following.set(null)
  touring.set(false)
}

export const visiting = store<{ x: number; y: number } | null>(null)

export function visit(tile: { x: number; y: number }) {
  steer()
  visiting.set({ ...tile })
}
