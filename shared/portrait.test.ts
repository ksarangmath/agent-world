import { describe, expect, it } from 'vitest'
import { portrait, portraitSize } from './portrait'
import { avatarSchema, type Avatar } from './profile'

const base: Avatar = {
  build: 'average',
  skin_tone: '#c68642',
  face_shape: 'oval',
  eye_shape: 'almond',
  eye_color: 'brown',
  brows: 'medium',
  nose: 'straight',
  lips: 'medium',
  hair_color: '#2c1b10',
  hair_style: 'short',
  facial_hair: 'none',
  glasses: 'none',
  top_style: 't-shirt',
  top_color: '#3366cc',
  bottom_style: 'pants',
  bottom_color: '#222222',
  shoe_color: '#111111',
}

const alpha = (pixels: Uint8ClampedArray, x: number, y: number) =>
  pixels[(y * portraitSize + x) * 4 + 3]

describe('portrait', () => {
  it('draws every preset with a face, a body, and a clear background corner', () => {
    for (const [trait, schema] of Object.entries(avatarSchema.shape)) {
      if (!('options' in schema)) continue
      for (const option of schema.options as string[]) {
        const pixels = portrait(avatarSchema.parse({ ...base, [trait]: option }))
        expect(pixels.length, `${trait}=${option}`).toBe(portraitSize * portraitSize * 4)
        expect(alpha(pixels, portraitSize / 2, 44), `${trait}=${option}`).toBe(255)
        expect(alpha(pixels, portraitSize / 2, portraitSize - 2), `${trait}=${option}`).toBe(255)
        expect(alpha(pixels, 0, 0), `${trait}=${option}`).toBe(0)
      }
    }
  })

  it('is deterministic', () => {
    expect(portrait(base)).toEqual(portrait(base))
  })
})
