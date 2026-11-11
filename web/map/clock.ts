import { useSyncExternalStore } from 'react'

export const sky = {
  time: { value: 0 },
  daylight: { value: 1 },
  golden: { value: 0 },
}

export const view = { left: 0, right: 0, top: 0, bottom: 0 }

export const viewFrom = { x: -0.34, y: 0.84, z: 0.94 }

export const onScreen = (x: number, y: number) =>
  x >= view.left && x <= view.right && y >= view.top && y <= view.bottom

export const chunkSize = 64

export const detailZoom = 10

let detailed = true
const detailListeners = new Set<() => void>()

export function showDetail(value: boolean) {
  if (value === detailed) return
  detailed = value
  detailListeners.forEach((listener) => listener())
}

export const useDetail = () =>
  useSyncExternalStore(
    (listener) => (detailListeners.add(listener), () => void detailListeners.delete(listener)),
    () => detailed,
  )

export function chunked<T extends { x: number; y: number }>(items: T[]): T[][] {
  const chunks = new Map<number, T[]>()
  for (const item of items) {
    const key = Math.floor(item.y / chunkSize) * 1000 + Math.floor(item.x / chunkSize)
    const list = chunks.get(key)
    if (list) list.push(item)
    else chunks.set(key, [item])
  }
  return [...chunks.values()]
}
