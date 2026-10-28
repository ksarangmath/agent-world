import {
  smoothstep,
  tri,
  ellipse,
  rgb,
  ramp,
  mixHex,
  faces,
  trace,
  eyeColors,
  type Rgb,
  type Ramp,
  type Tone,
  type Shape,
} from './pixel-art'
import type { Avatar } from './profile'

export const portraitSize = 128

const size = portraitSize
const cx = size / 2
const top = 14

const builds: Record<Avatar['build'], { shoulders: number; neck: number }> = {
  slim: { shoulders: 41, neck: 8 },
  average: { shoulders: 45, neck: 8.5 },
  athletic: { shoulders: 50, neck: 10 },
  curvy: { shoulders: 45, neck: 8.5 },
  heavy: { shoulders: 52, neck: 11.5 },
}

const eyeShapes: Record<
  Avatar['eye_shape'],
  { width: number; up: number; down: number; tilt: number; lash: number; crease: number }
> = {
  almond: { width: 7.4, up: 4.9, down: 3.3, tilt: 0.12, lash: 2.2, crease: 1 },
  round: { width: 6.8, up: 5.4, down: 4.3, tilt: 0, lash: 2, crease: 1 },
  hooded: { width: 7.4, up: 3.9, down: 3.2, tilt: 0.05, lash: 2.6, crease: 2 },
  monolid: { width: 7.6, up: 3.6, down: 2.8, tilt: 0.2, lash: 2.1, crease: 0 },
  downturned: { width: 7.4, up: 4.6, down: 3.3, tilt: -0.18, lash: 2.2, crease: 1 },
  upturned: { width: 7.4, up: 4.6, down: 3.2, tilt: 0.28, lash: 2.2, crease: 1 },
}

type Hair = {
  cap: number
  fringe: (dx: number) => number
  sides?: number
  inset?: number
  back?: { bottom: number; width: number; wave?: number }
  bumps?: number
  extra?: Shape
  part?: number
  texture: 'clumps' | 'curls' | 'ropes' | 'stipple'
}

const tips =
  (depth: number, point = 2) =>
  (dx: number) =>
    depth + point * tri(dx / 4.5)
const curtain = (low: number, high: number) => (dx: number) =>
  high + (low - high) * smoothstep(1, 15, Math.abs(dx)) + 1.5 * tri(dx / 4.5)

const hairStyles: Record<Exclude<Avatar['hair_style'], 'bald'>, Hair> = {
  buzzed: { cap: 1.5, fringe: () => 15, texture: 'stipple' },
  receding: {
    cap: 4,
    fringe: (dx) => 17 - 8 * Math.exp(-(((Math.abs(dx) - 12) / 4) ** 2)),
    texture: 'clumps',
  },
  short: { cap: 5, fringe: tips(16), texture: 'clumps' },
  'side-part': {
    cap: 6,
    fringe: (dx) => 13 + 8 * smoothstep(-8, 16, dx) + 2 * tri(dx / 4.5),
    part: -8,
    texture: 'clumps',
  },
  quiff: {
    cap: 5,
    fringe: tips(16, 1.5),
    extra: ellipse(cx + 3, top - 4, 16, 8.5),
    texture: 'clumps',
  },
  'short-curly': { cap: 8, fringe: tips(16), bumps: 2, texture: 'curls' },
  afro: {
    cap: 15,
    fringe: tips(16),
    bumps: 2.5,
    back: { bottom: 76, width: 12 },
    texture: 'curls',
  },
  pixie: {
    cap: 5,
    fringe: (dx) => 21 - 8 * smoothstep(-13, 10, dx) + 2 * tri(dx / 4),
    sides: 3,
    inset: 3,
    part: -6,
    texture: 'clumps',
  },
  medium: {
    cap: 6,
    fringe: curtain(21, 13),
    sides: 26,
    inset: 5,
    back: { bottom: 101, width: 5 },
    texture: 'clumps',
  },
  bob: {
    cap: 7,
    fringe: curtain(22, 14),
    sides: 29,
    inset: 5,
    back: { bottom: 90, width: 8 },
    texture: 'clumps',
  },
  'long-straight': {
    cap: 6,
    fringe: curtain(21, 13),
    sides: 54,
    inset: 5,
    back: { bottom: 128, width: 8 },
    texture: 'clumps',
  },
  'long-wavy': {
    cap: 7,
    fringe: curtain(21, 13),
    sides: 54,
    inset: 5,
    back: { bottom: 128, width: 11, wave: 2 },
    texture: 'clumps',
  },
  'long-curly': {
    cap: 9,
    fringe: curtain(20, 13),
    sides: 54,
    inset: 5,
    bumps: 2,
    back: { bottom: 125, width: 14, wave: 2.5 },
    texture: 'curls',
  },
  braids: { cap: 3, fringe: () => 15, back: { bottom: 123, width: 9 }, texture: 'ropes' },
  locs: {
    cap: 5,
    fringe: () => 16,
    sides: 32,
    inset: 4,
    back: { bottom: 115, width: 11 },
    texture: 'ropes',
  },
  ponytail: {
    cap: 3,
    fringe: curtain(19, 15),
    extra: ellipse(cx + 25, top + 32, 6, 13),
    texture: 'clumps',
  },
  bun: {
    cap: 3,
    fringe: curtain(19, 15),
    extra: ellipse(cx, top - 5, 10.5, 8.5),
    texture: 'clumps',
  },
  'man-bun': {
    cap: 4,
    fringe: tips(16, 1.5),
    extra: ellipse(cx + 4, top - 3, 7, 6),
    texture: 'clumps',
  },
}

const layers = ['back', 'neck', 'body', 'ears', 'head', 'beard', 'hair'] as const
type Layer = (typeof layers)[number]

export function portrait(avatar: Avatar): Uint8ClampedArray<ArrayBuffer> {
  const face = faces[avatar.face_shape]
  const build = builds[avatar.build]
  const height = face.chin - top
  const eyeY = Math.round(top + height * 0.54)
  const noseTip = eyeY + 12
  const mouthY = eyeY + 21
  const [crown, temple] = face.outline[0]!
  const crownY = top + crown * height
  const half = (y: number) => {
    const t = (y - top) / height
    if (t < 0 || t > 1) return -1
    if (t < crown)
      return face.half * temple * Math.sqrt(Math.max(0, 1 - ((crown - t) / crown) ** 2))
    return face.half * trace(face.outline, t)
  }
  const inHead: Shape = (x, y) => Math.abs(x - cx) <= half(y)
  const style = avatar.hair_style === 'bald' ? null : hairStyles[avatar.hair_style]

  const bumpy = (amount: number, x: number, y: number) =>
    amount * 0.5 * (1 + Math.sin(Math.atan2(y - top - 26, x - cx) * 11))
  const hairFront: Shape = (x, y) => {
    if (!style) return false
    if (style.extra?.(x, y)) return true
    const dx = x - cx
    const grow = style.cap + (style.bumps ? bumpy(style.bumps, x, y) : 0)
    const templeHalf = face.half * temple
    const reach = crownY + (style.sides ?? 0)
    const width =
      y < crownY
        ? (templeHalf + grow) *
          Math.sqrt(Math.max(0, 1 - ((crownY - y) / (crownY - top + grow)) ** 2))
        : Math.max(templeHalf, half(y)) + grow
    if (Math.abs(dx) > width || y > Math.max(reach, crownY + 2)) return false
    if (y < top + style.fringe(dx)) return true
    if (y > reach) return false
    const edge = half(y)
    if (edge < 0) return Math.abs(dx) > build.neck + 3
    return Math.abs(dx) > edge - (style.inset ?? 0)
  }
  const hairBack: Shape = (x, y) => {
    const back = style?.back
    if (!back) return false
    const wave = back.wave ? back.wave * Math.sin(y * 0.34) : 0
    const bump = style.bumps ? bumpy(style.bumps, x, y) : 0
    const width = face.half + back.width + wave + bump
    const rise = top + 21
    if (y < rise) return ((x - cx) / width) ** 2 + ((y - rise) / (21 + style.cap)) ** 2 <= 1
    const round = y > back.bottom - 8 ? 1 - ((y - (back.bottom - 8)) / 8) ** 2 : 1
    return y <= back.bottom && Math.abs(x - cx) <= width * Math.sqrt(Math.max(0, round))
  }
  const neck: Shape = (x, y) =>
    Math.abs(x - cx) <= build.neck + Math.max(0, y - face.chin - 4) * 0.6 &&
    y > face.chin - 13 &&
    y < 116
  const necklineY = face.chin + 9
  const collar = build.neck + 3.5
  const necklineDepth = avatar.top_style === 'blazer' ? 1 : avatar.top_style === 'shirt' ? 3 : 5
  const body: Shape = (x, y) => {
    const dx = Math.abs(x - cx)
    const shoulder = face.chin + 11 + 12 * (dx / build.shoulders) ** 2.2
    if (y < shoulder || dx > build.shoulders + Math.max(0, y - 115) * 0.4) return false
    return !(((x - cx) / collar) ** 2 + ((y - necklineY) / necklineDepth) ** 2 < 1)
  }
  const ears: Shape = (x, y) =>
    [-1, 1].some((side) => ellipse(cx + side * (half(eyeY) + 0.5), eyeY + 3, 3.4, 6)(x, y))
  const facial = avatar.facial_hair
  const mustache: Shape = (x, y) => ellipse(cx, mouthY - 3.5, 8.5, 2.5)(x, y) && y < mouthY - 1
  const mouthArea = ellipse(cx, mouthY + 0.5, 7.2, 2.6)
  const jaw: Shape = (x, y) => y > eyeY + 8 + 0.22 * Math.abs(x - cx)
  const beard: Shape = (x, y) => {
    if (facial === 'none' || facial === 'stubble' || mouthArea(x, y)) return false
    if (facial === 'mustache') return mustache(x, y)
    if (facial === 'goatee') return mustache(x, y) || ellipse(cx, mouthY + 7, 6.5, 6)(x, y)
    const extend = facial === 'full-beard' ? 7 : 2
    const reach = face.half * 0.9
    const below =
      y > face.chin - 10 &&
      y < face.chin + extend &&
      Math.abs(x - cx) <=
        reach * Math.sqrt(Math.max(0, 1 - ((y - face.chin + 10) / (10 + extend)) ** 2))
    return mustache(x, y) || (inHead(x, y) && jaw(x, y)) || below
  }

  const shapes: Record<Layer, Shape> = {
    back: hairBack,
    neck,
    body,
    ears,
    head: inHead,
    beard,
    hair: hairFront,
  }
  const skin = ramp(avatar.skin_tone)
  const hair = ramp(
    avatar.hair_style === 'buzzed'
      ? mixHex(avatar.hair_color, avatar.skin_tone, 0.3)
      : avatar.hair_color,
  )
  const clothes = ramp(avatar.top_color)
  const ramps: Record<Layer, Ramp> = {
    back: hair,
    neck: skin,
    body: clothes,
    ears: skin,
    head: skin,
    beard: hair,
    hair,
  }

  const layer = new Int8Array(size * size).fill(-1)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      layers.forEach((name, z) => {
        if (shapes[name](x + 0.5, y + 0.5)) layer[y * size + x] = z
      })
    }
  }
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= size || y >= size ? -1 : layer[y * size + x]!
  const [headLayer, bodyLayer, hairLayer, backLayer] = [
    layers.indexOf('head'),
    layers.indexOf('body'),
    layers.indexOf('hair'),
    layers.indexOf('back'),
  ]
  const pixels = new Uint8ClampedArray(size * size * 4)
  const paint = (x: number, y: number, [r, g, b]: Rgb) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    pixels.set([r, g, b, 255], (y * size + x) * 4)
  }
  const onFace = (x: number, y: number, color: Rgb) => {
    if (at(x, y) === headLayer) paint(x, y, color)
  }
  const dot = (x: number, y: number, color: Rgb) => onFace(Math.floor(x), Math.floor(y), color)

  const flow = { x: cx + (style?.part ?? 0), y: top - 4 }
  const hairTone = (x: number, y: number): Tone | null => {
    if (!style) return null
    if (style.texture === 'stipple') return (x * 3 + y * 5) % 4 === 0 ? 'shade' : null
    if (style.texture === 'curls') {
      const row = Math.floor(y / 5.5)
      const shift = (row % 2) * 3
      const column = Math.floor((x + shift) / 6)
      const [ox, oy] = [x + 0.5 - (column * 6 - shift + 3), y + 0.5 - (row * 5.5 + 2.75)]
      const d = Math.hypot(ox, oy)
      return d > 2.7 ? 'deep' : d < 1.4 && ox < 0 && oy < 0.5 ? 'light' : null
    }
    if (style.texture === 'ropes') {
      const across = (x - cx) / 3.4
      const fraction = across - Math.floor(across)
      if (fraction < 0.2) return 'deep'
      return (y + Math.abs(fraction - 0.5) * 6) % 4 < 1 ? 'shade' : null
    }
    const hanging = y > eyeY - 2
    let coordinate: number
    let sheen: boolean
    if (hanging) {
      coordinate = (x - cx + 1.6 * Math.sin(y * 0.22)) / 4.5
      sheen = Math.abs(y - (eyeY + 14)) < 2.5
    } else {
      const angle = Math.atan2(x - flow.x, y - flow.y)
      const radius = Math.hypot(x - flow.x, y - flow.y)
      coordinate = angle * 6.5 + Math.sin(radius * 0.35) * 0.25
      sheen = Math.abs(radius - (crownY - flow.y) * 0.72) < 2.2
    }
    const fraction = coordinate - Math.floor(coordinate)
    if (fraction < 0.16) return 'deep'
    if (sheen && fraction > 0.34 && fraction < 0.72) return 'light'
    return fraction > 0.86 ? 'shade' : null
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const z = at(x, y)
      if (z < 0) continue
      const name = layers[z]!
      const colors = ramps[name]
      const behind = [at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)].some(
        (n) => n < z && !(name === 'neck' && n >= 0),
      )
      if (behind) {
        paint(x, y, colors.outline)
        continue
      }
      let tone: Tone = 'base'
      if (at(x + 1, y + 1) !== z) tone = 'deep'
      else if (at(x + 4, y + 3) !== z) tone = 'shade'
      else if (at(x - 3, y - 3) !== z) tone = 'light'
      if (name === 'neck' && y < face.chin + 3) tone = y < face.chin + 1 ? 'deep' : 'shade'
      if (name === 'head' && [1, 2, 3].some((d) => at(x, y - d) === hairLayer)) tone = 'shade'
      if ((z === hairLayer || z === backLayer) && tone === 'base') tone = hairTone(x, y) ?? 'base'
      paint(x, y, colors[tone])
    }
  }

  const cloth = (x: number, y: number, color: Rgb) => {
    if (at(x, y) === bodyLayer) paint(x, y, color)
  }
  const shirtWhite = ramp('#f2eee6')
  for (let y = face.chin; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [dx, dy] = [x + 0.5 - cx, y + 0.5 - necklineY]
      const ring = (dx / collar) ** 2 + (dy / 5) ** 2
      switch (avatar.top_style) {
        case 't-shirt':
        case 'sweater':
          if (ring >= 1 && ring < (avatar.top_style === 'sweater' ? 1.9 : 1.45)) {
            cloth(x, y, clothes.deep)
          }
          break
        case 'shirt': {
          const flap =
            Math.abs(dx) > 1 && Math.abs(dx) < collar + 4 && dy > -3 && dy < 8 - Math.abs(dx) * 0.35
          if (flap) {
            const edge = Math.abs(dx) > collar + 2.6 || dy > 7 - Math.abs(dx) * 0.35
            cloth(x, y, edge ? clothes.deep : clothes.light)
          }
          if (Math.abs(dx) < 0.7 && dy > 8 && (Math.round(dy) - 9) % 7 === 0)
            cloth(x, y, clothes.deep)
          break
        }
        case 'hoodie': {
          const hood = (dx / (collar + 7)) ** 2 + ((dy + 3) / 7) ** 2
          if (hood < 1 && ring >= 1) cloth(x, y, hood > 0.75 ? clothes.deep : clothes.shade)
          if (Math.abs(Math.abs(dx) - 4) < 0.7 && dy > 3 && dy < 16) cloth(x, y, shirtWhite.base)
          break
        }
        case 'jacket':
          if (ring >= 1 && ring < 1.8) cloth(x, y, clothes.shade)
          if (Math.abs(dx) < 0.7 && dy > 1) cloth(x, y, clothes.deep)
          break
        case 'blazer': {
          const v = (dy + 3) * 0.3
          if (dy > -3 && Math.abs(dx) < v && dy < 20) {
            cloth(x, y, Math.abs(dx) > v - 1.2 ? shirtWhite.shade : shirtWhite.base)
          } else if (dy > -3 && Math.abs(dx) < v + 4.5 && dy < 24) {
            cloth(x, y, Math.abs(dx) > v + 3.4 ? clothes.outline : clothes.deep)
          }
          break
        }
      }
    }
  }

  if (facial === 'stubble') {
    const shadow = rgb(mixHex(avatar.skin_tone, avatar.hair_color, 0.2))
    for (let y = noseTip + 2; y < face.chin; y++) {
      for (let x = 0; x < size; x++) {
        const [px, py] = [x + 0.5, y + 0.5]
        const inside = [at(x + 1, y), at(x - 1, y), at(x, y + 1)].every((n) => n === headLayer)
        const zone = Math.abs(px - cx) > half(py) - 3 || py > mouthY + 5 || mustache(px, py)
        if (inside && zone && !mouthArea(px, py)) onFace(x, y, shadow)
      }
    }
  }

  const blush = ramp(mixHex(avatar.skin_tone, '#ef8a92', 0.3))
  const eye = eyeShapes[avatar.eye_shape]
  const iris = ramp(eyeColors[avatar.eye_color])
  const lash = ramp(mixHex(avatar.hair_color, '#1a1210', 0.6)).deep
  const white: Rgb = [246, 240, 233]
  const whiteShade: Rgb = [218, 206, 198]
  const irisRadius = eye.up * 0.92 + 0.4
  for (const side of [-1, 1]) {
    const ex = cx + side * 13.5
    for (let y = eyeY - 11; y <= eyeY + 8; y++) {
      for (let x = Math.floor(ex - 12); x <= Math.ceil(ex + 12); x++) {
        const u = (x + 0.5 - ex) * side
        const v = y + 0.5 - eyeY + u * eye.tilt
        const curve = Math.max(0, 1 - (u / eye.width) ** 2)
        const [upper, lower] = [-eye.up * curve ** 0.8, eye.down * curve]
        const flick = u - eye.width
        if (curve > 0 && v >= upper && v <= lower) {
          const [iu, iv] = [u + 0.3, v + eye.up * 0.12]
          const d = Math.hypot(iu, iv)
          if (d <= irisRadius * 0.42) onFace(x, y, iris.outline)
          else if (d <= irisRadius) {
            const ring = d > irisRadius - 0.8 || iv < -irisRadius * 0.35
            onFace(x, y, iris[ring ? 'deep' : iv > irisRadius * 0.4 ? 'light' : 'base'])
          } else onFace(x, y, v < upper + 1.3 ? whiteShade : white)
        } else if (v < upper && v >= upper - eye.lash && Math.abs(u) <= eye.width) {
          onFace(x, y, lash)
        } else if (flick > -1 && flick < 3 && v >= -2.2 - flick * 0.9 && v < -0.4 - flick * 0.9) {
          onFace(x, y, lash)
        } else if (
          v > lower &&
          v <= lower + 1 &&
          u > -eye.width * 0.2 &&
          Math.abs(u) <= eye.width
        ) {
          onFace(x, y, skin.deep)
        } else if (
          eye.crease > 0 &&
          v < upper - eye.lash - 0.8 &&
          v >= upper - eye.lash - 0.8 - eye.crease &&
          Math.abs(u) <= eye.width - 1.5
        ) {
          onFace(x, y, skin.shade)
        }
      }
    }
    const [glintX, glintY] = [
      ex - side * 0.3 - irisRadius * 0.38,
      eyeY - eye.up * 0.12 - irisRadius * 0.42,
    ]
    dot(glintX, glintY, white)
    dot(glintX + 1, glintY, white)
    dot(glintX, glintY + 1, white)
    dot(ex - side * 0.3 + irisRadius * 0.45, eyeY - eye.up * 0.12 + irisRadius * 0.35, iris.light)

    const browY = eyeY - 10
    const thickness = avatar.brows === 'thick' ? 2.8 : avatar.brows === 'medium' ? 2 : 1.4
    for (let x = Math.floor(ex - 10); x <= Math.ceil(ex + 10); x++) {
      const u = (x + 0.5 - ex) * side
      if (u < -7.5 || u > 8.5) continue
      const arch = browY - 2.2 * (1 - ((u - 0.8) / 8) ** 2) + Math.max(0, u - 4.5) * 0.35
      const width = thickness * (1 - Math.max(0, u + 3) / 16)
      for (let y = Math.floor(arch - width - 1); y <= Math.ceil(arch + width); y++) {
        const offset = y + 0.5 - arch
        if (Math.abs(offset) <= Math.max(0.5, width)) {
          onFace(x, y, offset < -width + 0.8 ? hair.shade : hair.deep)
        }
      }
    }

    const blushX = cx + side * 17
    for (let y = eyeY + 6; y <= eyeY + 11; y++) {
      for (let x = Math.floor(blushX - 5); x <= Math.ceil(blushX + 5); x++) {
        const d = ((x + 0.5 - blushX) / 4.2) ** 2 + ((y + 0.5 - eyeY - 8.5) / 1.8) ** 2
        if (d <= 1) onFace(x, y, blush.base)
      }
    }
  }

  const nose = avatar.nose
  const bridge = nose === 'aquiline' ? 9 : nose === 'button' ? 4 : 7
  const wing = nose === 'wide' ? 4 : nose === 'narrow' ? 2 : 3
  for (let y = noseTip - bridge; y < noseTip - 1; y++) {
    dot(cx + 3, y + 0.5 + (nose === 'aquiline' && y < noseTip - 5 ? -0.5 : 0), skin.shade)
    if (nose !== 'button') dot(cx - 1, y + 0.5, skin.light)
  }
  for (let x = -wing; x <= wing; x++) dot(cx + x + 0.5, noseTip + 0.5, skin.shade)
  dot(cx - wing - 0.5, noseTip - 0.5, skin.deep)
  dot(cx + wing + 1.5, noseTip - 0.5, skin.deep)
  dot(cx - 1.5, noseTip + 0.5, skin.deep)
  dot(cx + 2.5, noseTip + 0.5, skin.deep)
  dot(cx + 0.5, noseTip - 1.5, skin.light)

  const lips = ramp(mixHex(avatar.skin_tone, '#c4505a', 0.42))
  const lipWidth = avatar.lips === 'full' ? 7 : avatar.lips === 'medium' ? 6.5 : 6
  const upperRows = avatar.lips === 'full' ? 2 : avatar.lips === 'medium' ? 1 : 0
  const lowerRows = avatar.lips === 'full' ? 3 : avatar.lips === 'medium' ? 2 : 1
  for (let x = -Math.ceil(lipWidth); x <= Math.ceil(lipWidth); x++) {
    const u = Math.abs(x) / lipWidth
    if (u > 1) continue
    const seam = mouthY - (u > 0.72 ? 1 : 0)
    dot(cx + x + 0.5, seam + 0.5, lips.outline)
    for (let d = 1; d <= upperRows; d++) {
      const bow = Math.abs(x + 0.5) < 1.2 && d === upperRows
      if (u < 0.85 - d * 0.1 && !bow) dot(cx + x + 0.5, seam - d + 0.5, lips.deep)
    }
    for (let d = 1; d <= lowerRows; d++) {
      if (u < 0.88 - d * 0.12) {
        const shine = d === 1 && x >= -3 && x <= -1
        dot(
          cx + x + 0.5,
          seam + d + 0.5,
          shine ? lips.light : d === lowerRows ? lips.shade : lips.base,
        )
      }
    }
  }
  for (let x = -3; x <= 3; x++) dot(cx + x + 0.5, mouthY + lowerRows + 2.5, skin.shade)

  if (avatar.glasses !== 'none') {
    const frame: Rgb = avatar.glasses === 'sunglasses' ? [24, 22, 28] : [44, 38, 46]
    const put = (x: number, y: number) => paint(Math.floor(x), Math.floor(y), frame)
    for (const side of [-1, 1]) {
      const ex = cx + side * 13.5
      for (let y = eyeY - 11; y <= eyeY + 11; y++) {
        for (let x = Math.floor(ex - 12); x <= Math.ceil(ex + 12); x++) {
          const [px, py] = [x + 0.5 - ex, y + 0.5 - eyeY]
          const ring =
            avatar.glasses === 'round'
              ? Math.hypot(px, py * 1.1)
              : Math.max(Math.abs(px) * 0.9, Math.abs(py) * 1.3)
          if (Math.abs(ring - 9) < 0.6) paint(x, y, frame)
          else if (avatar.glasses === 'sunglasses' && ring < 9) {
            paint(x, y, px - py > 2 && px - py < 4.5 ? [92, 88, 104] : [30, 28, 36])
          }
        }
      }
      for (let x = 22; x <= 26; x++) put(cx + side * x + 0.5, eyeY - 1.5)
    }
    for (let x = -4; x <= 4; x++) put(cx + x + 0.5, eyeY - 1.5)
  }
  return pixels
}
