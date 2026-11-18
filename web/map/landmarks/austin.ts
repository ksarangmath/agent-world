import { decks } from '../decks'
import { beam, reserve, solid, type Light, type Part, type Point } from './shapes'
import { airport } from '../airports'
import { warp } from '../atlas'
import { heightAt } from '../elevation'
import { clearSite, offset, site, type Site } from './sites'

const granite = '#dc9c96'
const limestone = '#ece2cb'
const rust = '#9a4f2e'
const burntOrange = '#bf5700'
const beacon = '#ff3b2f'

export const wheelSite = () => clearSite(-97.6404, 30.1379, 3, 6)

export const pastureSite = () => clearSite(-98.004, 30.1385, 3.6, 8)

export const peacockSite = () => clearSite(-97.7716, 30.3158, 1.2, 3)

export function austinIcons() {
  const parts: Part[] = []
  const lights: Light[] = []
  const reserved = new Set<number>()
  const add = (s: Site, radius: number) => reserve(reserved, s.x, s.y, radius)
  const at = (s: Site, up = 0, dx = 0, dy = 0): Point => [s.x + dx, s.ground + up, s.y + dy]

  const capitol = site(-97.7404, 30.2749)
  add(capitol, 3.2)
  parts.push(solid('box', granite, at(capitol, -0.2), [5.6, 1.9, 2.2]))
  parts.push(solid('box', '#e8b0aa', at(capitol, -0.2, 0, 0.9), [1.8, 2.3, 1.2]))
  parts.push(solid('gable', '#cc8882', at(capitol, 2.1, 0, 0.9), [1.2, 0.6, 1.8], Math.PI / 2))
  for (const side of [-1, 1]) {
    parts.push(solid('box', '#d4928c', at(capitol, -0.2, side * 2.5), [0.9, 2.3, 2.5]))
  }
  parts.push(solid('cylinder', granite, at(capitol, 1.7), [1.9, 2.2, 1.9]))
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2
    parts.push(
      solid(
        'cylinder',
        '#f0d5c8',
        at(capitol, 2.2, Math.sin(angle) * 1.02, Math.cos(angle) * 1.02),
        [0.16, 1.4, 0.16],
      ),
    )
  }
  parts.push(solid('dome', '#cc8882', at(capitol, 3.9), [2, 1.25, 2]))
  parts.push(solid('cylinder', granite, at(capitol, 6.3), [0.5, 0.8, 0.5]))
  parts.push(solid('cone', '#f3ead8', at(capitol, 7.1), [0.3, 1, 0.3]))
  lights.push({ position: at(capitol, 8.2), color: '#fff3d0' })
  for (const side of [-1.6, 1.6]) {
    lights.push({ position: at(capitol, 1.2, side, 1.3), color: '#ffe2a8' })
  }
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2
    lights.push({
      position: at(capitol, 3.75, Math.sin(angle) * 1.15, Math.cos(angle) * 1.15),
      color: '#ffe2a8',
    })
  }
  for (const side of [-2.5, 2.5]) {
    lights.push({ position: at(capitol, 2.2, side, 1.35), color: '#ffe2a8' })
  }

  const tower = clearSite(-97.7394, 30.2862, 1)
  add(tower, 1.6)
  parts.push(solid('box', limestone, at(tower, -0.2), [2.6, 1.6, 1.6]))
  parts.push(solid('box', '#f3ead8', at(tower, 1.2), [1, 8.4, 1]))
  parts.push(solid('box', limestone, at(tower, 9.6), [1.2, 1.3, 1.2]))
  parts.push(solid('box', '#f3ead8', at(tower, 10.9), [0.8, 0.9, 0.8]))
  parts.push(solid('pyramid', '#b5a585', at(tower, 11.8), [0.8, 0.7, 0.8]))
  for (const [dx, dy] of [
    [0.62, 0],
    [-0.62, 0],
    [0, 0.62],
    [0, -0.62],
  ] as const) {
    lights.push({ position: at(tower, 10.3, dx, dy), color: '#ff8a1f' })
    lights.push({ position: at(tower, 8.6, dx, dy), color: '#ff8a1f' })
  }

  const frost = clearSite(-97.7427, 30.2663, 1)
  add(frost, 1.8)
  parts.push(solid('box', '#9fc0d4', at(frost, -0.2), [2.2, 10.5, 2.2]))
  parts.push(solid('box', '#b5d3e3', at(frost, 10.3), [1.7, 2.6, 1.7]))
  for (const [dx, dy] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const) {
    parts.push(
      beam(
        '#d9ecf5',
        at(frost, 12.9, dx * 0.8, dy * 0.8),
        at(frost, 15.6, dx * 0.12, dy * 0.12),
        0.5,
        0.12,
      ),
    )
  }
  parts.push(solid('pyramid', '#d9ecf5', at(frost, 12.9), [1.1, 2.9, 1.1]))
  lights.push({ position: at(frost, 15.9), color: '#e6f6ff', shimmer: 2 })

  const jenga = clearSite(-97.7512, 30.2678, 1)
  add(jenga, 1.8)
  ;[0.28, -0.28, 0.28, -0.28].forEach((shift, tier) => {
    parts.push(
      solid(
        'box',
        tier % 2 ? '#8fa9bc' : '#a7bfd0',
        at(jenga, -0.2 + tier * 4.1, shift, -shift * 0.6),
        [1.9, 4.1, 1.9],
      ),
    )
  })
  parts.push(solid('box', '#c9d6df', at(jenga, 16.2), [1.5, 1.1, 1.5]))
  lights.push({ position: at(jenga, 17.5), color: beacon, blink: 1 })

  const stadium = clearSite(-97.7325, 30.2837, 3.2, 3)
  add(stadium, 3.8)
  parts.push(solid('cylinder', '#4f9d48', at(stadium), [3.2, 0.08, 5.4]))
  for (let i = 0; i < 28; i++) {
    const angle = (i / 28) * Math.PI * 2
    const [sin, cos] = [Math.sin(angle), Math.cos(angle)]
    const open = Math.abs(sin) < 0.25 && cos > 0
    parts.push(
      solid(
        'box',
        i % 2 ? burntOrange : '#f1ece2',
        at(stadium, 0, sin * 2.5, cos * 3.6),
        [0.75, open ? 0.7 : 1.9, 0.85],
        Math.atan2(sin * 3.6, cos * 2.5),
      ),
    )
  }
  parts.push(solid('box', '#2b2f38', at(stadium, 0, 0, 4.3), [2.2, 2.6, 0.3]))
  for (const [dx, dy] of [
    [2.7, 3.4],
    [-2.7, 3.4],
    [2.7, -3.4],
    [-2.7, -3.4],
  ] as const) {
    parts.push(solid('box', '#8a8f94', at(stadium, 0, dx, dy), [0.12, 3.2, 0.12]))
    lights.push({ position: at(stadium, 3.3, dx, dy), color: '#ffffff' })
  }

  for (const [lon, lat] of [
    [-97.7495, 30.276],
    [-97.7215, 30.2652],
    [-97.7282, 30.3082],
    [-97.7665, 30.2668],
  ] as const) {
    const moon = clearSite(lon, lat, 0.3)
    add(moon, 0.7)
    for (const lean of [-0.22, 0.22]) {
      parts.push(beam('#7d858c', at(moon, 0, lean, 0), at(moon, 8.2, 0, 0), 0.08))
      parts.push(beam('#7d858c', at(moon, 0, 0, lean), at(moon, 8.2, 0, 0), 0.08))
    }
    parts.push(solid('cylinder', '#9aa2a8', at(moon, 8.2), [0.7, 0.08, 0.7]))
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2
      lights.push({
        position: at(moon, 8.2, Math.sin(angle) * 0.32, Math.cos(angle) * 0.32),
        color: '#cfe8ff',
      })
    }
  }

  const arch = site(-97.797, 30.3498)
  const spanned = decks.filter(
    (deck) => (deck.x - arch.x) ** 2 + (deck.y - arch.y) ** 2 < 49 && deck.span === 'generic',
  )
  if (spanned.length > 1) {
    const ends = spanned.flatMap((a) => spanned.map((b) => [a, b] as const))
    const [south, north] = ends.reduce((far, pair) =>
      Math.hypot(pair[1].x - pair[0].x, pair[1].y - pair[0].y) >
      Math.hypot(far[1].x - far[0].x, far[1].y - far[0].y)
        ? pair
        : far,
    )
    const yaw = Math.atan2(north.x - south.x, north.y - south.y)
    const middle = { x: (south.x + north.x) / 2, y: (south.y + north.y) / 2 }
    const along = (deck: (typeof spanned)[number]) =>
      (deck.x - middle.x) * Math.sin(yaw) + (deck.y - middle.y) * Math.cos(yaw)
    const reach = spanned.map(along)
    const [from, to] = [Math.min(...reach) - 0.8, Math.max(...reach) + 0.8]
    const deck = Math.max(...spanned.map((piece) => piece.height))
    const bridge = { ...middle, ground: deck }
    const rise = (t: number) => 0.2 + 2.6 * 4 * t * (1 - t)
    const steps = Math.max(6, Math.ceil((to - from) * 1.5))
    for (const across of [-0.62, 0.62]) {
      for (let k = 0; k < steps; k++) {
        const [t0, t1] = [k / steps, (k + 1) / steps]
        parts.push(
          beam(
            rust,
            offset(bridge, yaw, from + (to - from) * t0, across, rise(t0)),
            offset(bridge, yaw, from + (to - from) * t1, across, rise(t1)),
            0.22,
          ),
        )
        if (k > 0) {
          parts.push(
            beam(
              rust,
              offset(bridge, yaw, from + (to - from) * t0, across, 0),
              offset(bridge, yaw, from + (to - from) * t0, across, rise(t0)),
              0.06,
            ),
          )
        }
      }
    }
    for (const t of [0.3, 0.5, 0.7]) {
      parts.push(
        beam(
          rust,
          offset(bridge, yaw, from + (to - from) * t, -0.62, rise(t)),
          offset(bridge, yaw, from + (to - from) * t, 0.62, rise(t)),
          0.14,
        ),
      )
    }
    lights.push({
      position: offset(bridge, yaw, (from + to) / 2, 0, rise(0.5) + 0.2),
      color: beacon,
      blink: 1,
    })
  }

  const circuit = clearSite(-97.6366, 30.1356, 4.2, 6)
  add(circuit, 5.5)
  add(wheelSite(), 4.6)
  add(pastureSite(), 3.8)
  add(peacockSite(), 1.6)
  parts.push(solid('cylinder', '#3d414b', at(circuit, 0.01), [8.4, 0.05, 5]))
  parts.push(solid('cylinder', '#6fb35a', at(circuit, 0.03), [6.6, 0.05, 3.3]))
  parts.push(solid('box', '#d9dde2', at(circuit, 0, 0, 3), [4.2, 0.9, 0.6]))
  parts.push(solid('box', '#c8102e', at(circuit, 0.9, 0, 3), [4.4, 0.1, 0.8]))
  const mast: Point = at(circuit, 0, -3.2, -1.2)
  parts.push(solid('cylinder', '#f1f1ee', mast, [0.4, 7.2, 0.4]))
  parts.push(solid('box', '#f1f1ee', [mast[0], mast[1] + 7.2, mast[2]], [1.1, 0.25, 1.1]))
  for (let i = 0; i < 7; i++) {
    const spread = (i - 3) * 0.16
    parts.push(
      beam(
        '#c8102e',
        [mast[0] + spread, mast[1] + 7.3, mast[2]],
        [mast[0] + spread * 4, mast[1], mast[2] - 2.4],
        0.07,
      ),
    )
  }
  lights.push({ position: [mast[0], mast[1] + 7.7, mast[2]], color: beacon, blink: 0.5 })

  const works = clearSite(-97.6188, 30.2262, 3.6, 6)
  add(works, 4.4)
  parts.push(solid('box', '#eceef0', at(works, -0.2), [8.4, 1.3, 2.4]))
  parts.push(solid('box', '#2f4a66', at(works, 1.1), [8, 0.06, 2]))
  parts.push(solid('box', '#c9ced3', at(works, -0.2, -2.6, 1.5), [2.4, 0.9, 0.8]))
  for (const dx of [-3.4, 0, 3.4]) {
    lights.push({ position: at(works, 1.3, dx, 1.25), color: '#e6f6ff' })
  }

  for (const [lon, lat, cab] of [
    [-97.666, 30.1975, '#2e3d4d'],
    [-97.7025, 30.2965, '#3d7fc4'],
  ] as const) {
    const control = clearSite(lon, lat, 0.6)
    add(control, 0.9)
    parts.push(solid('taper', '#f1f1ee', at(control), [0.55, 4.2, 0.55]))
    parts.push(solid('cylinder', cab, at(control, 4.2), [0.95, 0.55, 0.95]))
    parts.push(solid('cylinder', '#f1f1ee', at(control, 4.75), [1.05, 0.1, 1.05]))
    lights.push({ position: at(control, 5.1), color: beacon, blink: 0.5 })
  }

  for (const [lon, lat, band] of [
    [-97.6772, 30.5102, '#2f6fbf'],
    [-97.8418, 30.0822, '#c8102e'],
    [-97.6212, 30.4385, '#3d9970'],
  ] as const) {
    const tank = clearSite(lon, lat, 0.7)
    add(tank, 0.9)
    for (const [dx, dy] of [
      [0.4, 0.4],
      [0.4, -0.4],
      [-0.4, 0.4],
      [-0.4, -0.4],
    ] as const) {
      parts.push(beam('#c9ced3', at(tank, 0, dx, dy), at(tank, 3, dx * 0.7, dy * 0.7), 0.08))
    }
    parts.push(solid('cylinder', '#c9ced3', at(tank), [0.18, 3, 0.18]))
    parts.push(solid('cylinder', '#f4f4f0', at(tank, 3), [1.2, 0.8, 1.2]))
    parts.push(solid('cylinder', band, at(tank, 3.25), [1.23, 0.22, 1.23]))
    parts.push(solid('dome', '#f4f4f0', at(tank, 3.8), [1.2, 0.3, 1.2]))
    lights.push({ position: at(tank, 4.5), color: beacon, blink: 0.5 })
  }

  const terminal = clearSite(-97.6684, 30.2022, 1.6)
  add(terminal, 2.4)
  parts.push(solid('box', '#e9edf0', at(terminal, -0.2), [4.2, 0.9, 1.3]))
  parts.push(solid('box', '#2e4a66', at(terminal, 0.3), [4.3, 0.22, 1.36]))
  parts.push(solid('box', '#c9ced3', at(terminal, 0.7), [3.6, 0.12, 0.9]))
  for (const dx of [-1.5, 0, 1.5]) {
    parts.push(solid('box', '#dfe4e8', at(terminal, -0.2, dx, 1.1), [0.35, 0.45, 1.1]))
    lights.push({ position: at(terminal, 0.85, dx, 0.7), color: '#ffe2a8' })
  }
  for (const [[fromLat, fromLon], [toLat, toLon]] of [airport.landing, airport.takeoff]) {
    const [[ax, ay], [bx, by]] = [warp(fromLon, fromLat), warp(toLon, toLat)]
    const length = Math.hypot(bx - ax, by - ay)
    const level = (x: number, y: number) => Math.max(heightAt(x, y), 0.3) + 0.03
    const steps = Math.ceil(length)
    for (let k = 0; k < steps; k++) {
      const [t0, t1] = [k / steps, (k + 1) / steps]
      const [x0, y0, x1, y1] = [
        ax + (bx - ax) * t0,
        ay + (by - ay) * t0,
        ax + (bx - ax) * t1,
        ay + (by - ay) * t1,
      ]
      reserve(reserved, (x0 + x1) / 2, (y0 + y1) / 2, 1.3)
      parts.push(beam('#4b4f59', [x0, level(x0, y0), y0], [x1, level(x1, y1), y1], 0.05, 1.2))
      if (k % 2 === 0) {
        const [mx, my] = [(x0 + x1) / 2, (y0 + y1) / 2]
        parts.push(
          beam(
            '#f1f1ee',
            [x0 + (mx - x0) * 0.3, level(mx, my) + 0.03, y0 + (my - y0) * 0.3],
            [mx, level(mx, my) + 0.03, my],
            0.02,
            0.1,
          ),
        )
        if (k % 4 === 0) {
          for (const side of [-0.62, 0.62]) {
            lights.push({
              position: [
                mx + ((by - ay) / length) * side,
                level(mx, my) + 0.1,
                my - ((bx - ax) / length) * side,
              ],
              color: '#7fd4ff',
            })
          }
        }
      }
    }
  }

  return { parts, lights, reserved }
}
