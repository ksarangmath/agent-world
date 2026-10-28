import type { Avatar } from './profile'

export type Rgb = [number, number, number]
export type Ramp = { outline: Rgb; deep: Rgb; shade: Rgb; base: Rgb; light: Rgb }
export type Tone = keyof Ramp
export type Shape = (x: number, y: number) => boolean

export const clamp = (value: number, low = 0, high = 1) => Math.min(high, Math.max(low, value))
export const smoothstep = (from: number, to: number, x: number) => {
  const t = clamp((x - from) / (to - from))
  return t * t * (3 - 2 * t)
}
export const tri = (x: number) => 1 - Math.abs(2 * (x - Math.floor(x)) - 1)
export const ellipse =
  (x0: number, y0: number, rx: number, ry: number): Shape =>
  (x, y) =>
    ((x - x0) / rx) ** 2 + ((y - y0) / ry) ** 2 <= 1

export function rgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function toHsl([r, g, b]: Rgb): [number, number, number] {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255]
  const [max, min] = [Math.max(rr, gg, bb), Math.min(rr, gg, bb)]
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h =
    max === rr
      ? (gg - bb) / d + (gg < bb ? 6 : 0)
      : max === gg
        ? (bb - rr) / d + 2
        : (rr - gg) / d + 4
  return [h / 6, s, l]
}

function fromHsl(h: number, s: number, l: number): Rgb {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (t: number) => {
    const u = ((t % 1) + 1) % 1
    if (u < 1 / 6) return p + (q - p) * 6 * u
    if (u < 1 / 2) return q
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6
    return p
  }
  return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)].map((c) =>
    Math.round(clamp(c) * 255),
  ) as Rgb
}

const towardHue = (from: number, to: number, amount: number) => {
  let delta = to - from
  if (delta > 0.5) delta -= 1
  if (delta < -0.5) delta += 1
  return from + delta * amount
}

export function ramp(hex: string): Ramp {
  const color = rgb(hex)
  const [h, s, l] = toHsl(color)
  const dark = (hue: number, light: number, saturation: number) =>
    fromHsl(towardHue(h, 0.72, hue), clamp(s + saturation), l * light)
  return {
    outline: dark(0.14, 0.32, 0.06),
    deep: dark(0.08, 0.64, 0.02),
    shade: dark(0.04, 0.84, 0),
    base: color,
    light: fromHsl(towardHue(h, 0.14, 0.05), clamp(s - 0.04), clamp(l + (1 - l) * 0.32)),
  }
}

export const mixHex = (a: string, b: string, amount: number) => {
  const [x, y] = [rgb(a), rgb(b)]
  return `#${x
    .map((c, i) => Math.round(c + (y[i]! - c) * amount))
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')}`
}

export type Outline = [t: number, width: number][]

export const faces: Record<Avatar['face_shape'], { half: number; chin: number; outline: Outline }> =
  {
    oval: {
      half: 26,
      chin: 85,
      outline: [
        [0.4, 0.95],
        [0.55, 1],
        [0.68, 0.97],
        [0.8, 0.84],
        [0.94, 0.42],
        [0.98, 0.36],
        [1, 0.3],
      ],
    },
    round: {
      half: 27.5,
      chin: 82,
      outline: [
        [0.4, 0.96],
        [0.55, 1],
        [0.7, 1],
        [0.82, 0.92],
        [0.92, 0.68],
        [0.97, 0.5],
        [1, 0.4],
      ],
    },
    square: {
      half: 26.5,
      chin: 84,
      outline: [
        [0.4, 0.97],
        [0.55, 1],
        [0.72, 0.99],
        [0.84, 0.95],
        [0.88, 0.88],
        [0.96, 0.52],
        [1, 0.44],
      ],
    },
    heart: {
      half: 27,
      chin: 85,
      outline: [
        [0.4, 0.97],
        [0.52, 1],
        [0.66, 0.93],
        [0.78, 0.76],
        [0.94, 0.34],
        [0.98, 0.28],
        [1, 0.24],
      ],
    },
    long: {
      half: 24.5,
      chin: 89,
      outline: [
        [0.4, 0.96],
        [0.55, 1],
        [0.72, 0.98],
        [0.84, 0.84],
        [0.95, 0.42],
        [0.98, 0.36],
        [1, 0.32],
      ],
    },
  }

export function trace(outline: Outline, t: number): number {
  const i = outline.findIndex(([at]) => at >= t)
  if (i <= 0) return outline[0]![1]
  const [[t0, w0], [t1, w1]] = [outline[i - 1]!, outline[i]!]
  return w0 + ((w1 - w0) * (t - t0)) / (t1 - t0)
}

export const eyeColors: Record<Avatar['eye_color'], string> = {
  'dark-brown': '#3b2418',
  brown: '#6b4126',
  hazel: '#8a6a32',
  green: '#4f8a52',
  blue: '#4f86c9',
  gray: '#8496a6',
}
