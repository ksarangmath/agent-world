import { DataTexture, NearestFilter, RGBAFormat } from 'three'
import type { Avatar } from '../../shared/profile'
import lpc from './lpc.json'

type Part = keyof typeof lpc.parts
type Material = keyof typeof lpc.palettes

export type Layer = { sheet: string; z: number; ramp: number; eyes: number }

const humanSkin = ['light', 'amber', 'olive', 'taupe', 'bronze', 'brown', 'black']
const naturalHair = [
  'ash',
  'platinum',
  'white',
  'gray',
  'blonde',
  'sandy',
  'strawberry',
  'gold',
  'ginger',
  'carrot',
  'redhead',
  'red',
  'light_brown',
  'chestnut',
  'dark_brown',
  'dark_gray',
  'black',
  'raven',
]
const grayHair = new Set(['ash', 'platinum', 'white', 'gray'])

const hairParts: Record<Avatar['hair_style'], Part | null> = {
  bald: null,
  buzzed: 'hair_buzzcut',
  receding: 'hair_balding',
  short: 'hair_plain',
  'side-part': 'hair_parted',
  quiff: 'hair_idol',
  'short-curly': 'hair_curly_short',
  afro: 'hair_afro',
  pixie: 'hair_pixie',
  medium: 'hair_curtains',
  bob: 'hair_bob',
  'long-straight': 'hair_long_straight',
  'long-wavy': 'hair_wavy',
  'long-curly': 'hair_curly_long',
  braids: 'hair_twists_straight',
  locs: 'hair_dreadlocks_long',
  ponytail: 'hair_ponytail',
  bun: 'hair_topknot_long',
  'man-bun': 'hair_topknot_short',
}

const facialParts: Record<Avatar['facial_hair'], Part | null> = {
  none: null,
  stubble: 'beard_stubble',
  mustache: 'mustache',
  goatee: 'mustache_french',
  'short-beard': 'beard_trimmed',
  'full-beard': 'beard_full',
}

const glassesParts: Record<Avatar['glasses'], Part | null> = {
  none: null,
  round: 'glasses_round',
  square: 'glasses_square',
  sunglasses: 'glasses_sun',
}

const topParts: Record<Avatar['top_style'], Part> = {
  't-shirt': 'tshirt',
  shirt: 'buttoned',
  sweater: 'longsleeve',
  hoodie: 'longsleeve',
  jacket: 'cardigan',
  blazer: 'cardigan',
}

const bottomParts: Record<Avatar['bottom_style'], Part> = {
  pants: 'pants',
  shorts: 'shorts',
  skirt: 'skirt',
}

const eyeRamps: Record<Avatar['eye_color'], string> = {
  'dark-brown': 'brown',
  brown: 'brown',
  hazel: 'brown',
  green: 'green',
  blue: 'blue',
  gray: 'gray',
}

const materials = Object.keys(lpc.palettes) as Material[]
const rows = new Map<string, number>()
materials.forEach((material) =>
  Object.keys(lpc.palettes[material]).forEach((name) => rows.set(`${material}:${name}`, rows.size)),
)

export const paletteRows = rows.size

export const paletteTexture = (() => {
  const data = new Uint8Array(6 * rows.size * 4)
  for (const material of materials) {
    for (const [name, ramp] of Object.entries(lpc.palettes[material] as Record<string, string[]>)) {
      const row = rows.get(`${material}:${name}`)!
      ramp.forEach((hex, i) => {
        const value = Number.parseInt(hex.slice(1), 16)
        data.set([(value >> 16) & 255, (value >> 8) & 255, value & 255, 255], (row * 6 + i) * 4)
      })
    }
  }
  const texture = new DataTexture(data, 6, rows.size, RGBAFormat)
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.needsUpdate = true
  return texture
})()

export const baseRamp = (material: Material) =>
  (lpc.palettes[material] as Record<string, string[]>)[lpc.bases[material]]!.map((hex) => {
    const value = Number.parseInt(hex.slice(1), 16)
    return [(value >> 16) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255] as const
  })

export const materialOf = (sheet: string) => sheetMaterials.get(sheet) ?? null

const elderlyEyes = ['#18506f', '#4f8fba', '#6cdce7'].map((hex) => {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255] as const
})

export const eyeBaseOf = (sheet: string) =>
  sheet.includes('_elderly') ? elderlyEyes : baseRamp('eye')

const sheetMaterials = new Map<string, Material | null>()
for (const part of Object.values(lpc.parts)) {
  for (const layer of part.layers) {
    sheetMaterials.set(layer.male, part.material as Material | null)
    sheetMaterials.set(layer.female, part.material as Material | null)
  }
}

function nearest(
  material: Material,
  hex: string,
  names: string[] = Object.keys(lpc.palettes[material]),
) {
  const value = Number.parseInt(hex.slice(1), 16)
  const target = [(value >> 16) & 255, (value >> 8) & 255, value & 255]
  let best = names[0]!
  let bestDistance = Infinity
  for (const name of names) {
    const mid = Number.parseInt(
      (lpc.palettes[material] as Record<string, string[]>)[name]![3]!.slice(1),
      16,
    )
    const color = [(mid >> 16) & 255, (mid >> 8) & 255, mid & 255]
    const distance = color.reduce((sum, c, i) => sum + (c - target[i]!) ** 2, 0)
    if (distance < bestDistance) [best, bestDistance] = [name, distance]
  }
  return best
}

export function layersOf(avatar: Avatar): Layer[] {
  const hairName = nearest('hair', avatar.hair_color, naturalHair)
  const row = (material: Material, name: string) => rows.get(`${material}:${name}`)!
  const skin = row('body', nearest('body', avatar.skin_tone, humanSkin))
  const hair = row('hair', hairName)
  const cloth = (hex: string) => row('cloth', nearest('cloth', hex))
  const head = `head_${avatar.gender}${grayHair.has(hairName) ? '_elderly' : ''}` as Part
  const chosen: [Part | null, number][] = [
    ['body', skin],
    [head, skin],
    ['shoes', cloth(avatar.shoe_color)],
    [bottomParts[avatar.bottom_style], cloth(avatar.bottom_color)],
    [topParts[avatar.top_style], cloth(avatar.top_color)],
    [facialParts[avatar.facial_hair], hair],
    [hairParts[avatar.hair_style], hair],
    [glassesParts[avatar.glasses], -1],
  ]
  const eyes = row('eye', eyeRamps[avatar.eye_color])
  return chosen.flatMap(([part, ramp]) =>
    part
      ? lpc.parts[part].layers.map((layer) => ({
          sheet: layer[avatar.gender],
          z: layer.z,
          ramp: lpc.parts[part].material ? ramp : -1,
          eyes: part === head ? eyes : -1,
        }))
      : [],
  )
}

export const credits = lpc.credits
