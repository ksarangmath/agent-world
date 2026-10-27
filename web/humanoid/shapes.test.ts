import { Vector3, type BufferGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { avatarSchema, type Avatar } from '../../shared/profile'
import { figure } from './model'
import { shape } from './shapes'

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

const choices = Object.entries(avatarSchema.shape).flatMap(([trait, schema]) =>
  'options' in schema ? (schema.options as string[]).map((option) => ({ [trait]: option })) : [],
)

const facing = (geometry: BufferGeometry, side: number) => {
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  const index = geometry.getIndex()!
  const [a, b, c, n] = [new Vector3(), new Vector3(), new Vector3(), new Vector3()]
  let agreement = 0
  for (let i = 0; i < index.count; i += 3) {
    a.fromBufferAttribute(position, index.getX(i))
    b.fromBufferAttribute(position, index.getX(i + 1))
    c.fromBufferAttribute(position, index.getX(i + 2))
    if (Math.sign(a.x + b.x + c.x) !== side) continue
    n.fromBufferAttribute(normal, index.getX(i))
    agreement += Math.sign(b.sub(a).cross(c.sub(a)).dot(n))
  }
  return agreement
}

describe('humanoid shapes', () => {
  it('winds both eyes to face forward', () => {
    for (const piece of ['whites', 'irises', 'darks', 'glints']) {
      const eyes = shape(`eyes:oval:almond:${piece}`)
      expect(facing(eyes, -1), piece).toBeGreaterThan(0)
      expect(facing(eyes, 1), piece).toBeGreaterThan(0)
    }
  })

  it('builds every preset on every face shape and build', () => {
    for (const face_shape of avatarSchema.shape.face_shape.options) {
      for (const build of avatarSchema.shape.build.options) {
        for (const choice of choices) {
          const avatar = avatarSchema.parse({ ...base, face_shape, build, ...choice })
          const { near, far } = figure(avatar, { talking: true, vehicle: '#ffffff' })
          for (const part of [...near, ...far]) {
            const geometry = shape(part.shape)
            const corners = geometry.getIndex()?.count ?? geometry.getAttribute('position').count
            expect(corners, part.shape).toBeGreaterThan(0)
          }
        }
      }
    }
  })
})
