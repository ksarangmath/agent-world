export const levels = [
  { pixel: 1, normals: true, shadows: true, glow: true },
  { pixel: 1, normals: false, shadows: true, glow: true },
  { pixel: 2, normals: false, shadows: true, glow: true },
  { pixel: 2, normals: false, shadows: false, glow: true },
  { pixel: 2, normals: false, shadows: false, glow: false },
] as const

const strikes = 3
const calm = 5
const firstRetryMs = 30_000
const longestRetryMs = 480_000
const trialMs = 20_000

export type Pace = {
  level: number
  slow: number
  steady: number
  retryAt: number
  retryMs: number
  trialUntil: number
}

export const fresh = (): Pace => ({
  level: 0,
  slow: 0,
  steady: 0,
  retryAt: 0,
  retryMs: firstRetryMs,
  trialUntil: 0,
})

export const quality = fresh()

export function settle(pace: Pace) {
  pace.slow = 0
  pace.steady = 0
}

export function sample(pace: Pace, slow: boolean, now: number): boolean {
  pace.slow = slow ? pace.slow + 1 : 0
  pace.steady = slow ? 0 : pace.steady + 1
  const lower = pace.slow === strikes && pace.level < levels.length - 1
  const raise = pace.steady >= calm && pace.level > 0 && now >= pace.retryAt
  if (!lower && !raise) return false
  if (lower) {
    pace.retryMs = now < pace.trialUntil ? Math.min(longestRetryMs, pace.retryMs * 2) : firstRetryMs
    pace.retryAt = now + pace.retryMs
  }
  pace.trialUntil = raise ? now + trialMs : 0
  pace.level += lower ? 1 : -1
  settle(pace)
  return true
}
