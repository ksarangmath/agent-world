import { describe, expect, it } from 'vitest'
import { avatarSchema, type Avatar } from '../../shared/profile'
import { layersOf, paletteRows } from './lpc'
import lpc from './lpc.json'

const base: Avatar = {
  gender: 'female',
  skin_tone: '#c68642',
  eye_color: 'brown',
  hair_color: '#c0c0c0',
  hair_style: 'bob',
  facial_hair: 'none',
  glasses: 'none',
  top_style: 't-shirt',
  top_color: '#3366cc',
  bottom_style: 'skirt',
  bottom_color: '#222222',
  shoe_color: '#111111',
}

const sheets = new Set(
  Object.values(lpc.parts).flatMap((part) =>
    part.layers.flatMap((layer) => [layer.male, layer.female]),
  ),
)

describe('LPC layers', () => {
  it('maps every preset to vendored sheets and existing palette rows', () => {
    for (const gender of avatarSchema.shape.gender.options) {
      for (const [trait, schema] of Object.entries(avatarSchema.shape)) {
        if (!('options' in schema)) continue
        for (const option of schema.options as string[]) {
          const layers = layersOf(avatarSchema.parse({ ...base, gender, [trait]: option }))
          expect(layers.length, `${trait}=${option}`).toBeGreaterThanOrEqual(5)
          for (const layer of layers) {
            expect(sheets.has(layer.sheet), layer.sheet).toBe(true)
            expect(layer.ramp).toBeLessThan(paletteRows)
            expect(layer.eyes).toBeLessThan(paletteRows)
          }
        }
      }
    }
  })

  it('uses the elderly head for gray hair', () => {
    const sheetsOf = (avatar: Avatar) => layersOf(avatar).map((layer) => layer.sheet)
    expect(sheetsOf(base).some((sheet) => sheet.includes('elderly'))).toBe(true)
    expect(
      sheetsOf({ ...base, hair_color: '#2c1b10' }).some((sheet) => sheet.includes('elderly')),
    ).toBe(false)
  })
})
