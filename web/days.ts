const dayMs = 24 * 60 * 60 * 1000

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()

export function dayLabel(iso: string, now = new Date()) {
  const day = new Date(iso)
  const daysAgo = Math.round((startOfDay(now) - startOfDay(day)) / dayMs)
  if (daysAgo <= 0) return 'Today'
  if (daysAgo === 1) return 'Yesterday'
  return day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

export function byDay<T>(items: T[], at: (item: T) => string, now = new Date()) {
  const days: { label: string; items: T[] }[] = []
  for (const item of items) {
    const label = dayLabel(at(item), now)
    const last = days.at(-1)
    if (last?.label === label) last.items.push(item)
    else days.push({ label, items: [item] })
  }
  return days
}
