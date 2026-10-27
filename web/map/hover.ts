export type Hover = { id: string; name: string; placeId: string; x: number; y: number }

let current: Hover | null = null
const listeners = new Set<() => void>()

export const hovered = {
  get: () => current,
  set(next: Hover | null) {
    if (current === null && next === null) return
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
