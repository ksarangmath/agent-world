import {
  Color,
  DataTexture,
  Float32BufferAttribute,
  MeshToonMaterial,
  NearestFilter,
  RedFormat,
  type BufferGeometry,
  type MeshToonMaterialParameters,
} from 'three'

export function colored(geometry: BufferGeometry, hex: string): BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry
  const { r, g, b } = new Color(hex)
  const count = flat.getAttribute('position').count
  flat.setAttribute(
    'color',
    new Float32BufferAttribute(Array.from({ length: count }, () => [r, g, b]).flat(), 3),
  )
  return flat
}

export const toonRamp = (() => {
  const shades = Uint8Array.from({ length: 64 }, (_, i) => Math.round(105 + 150 * (i / 63) ** 0.8))
  const texture = new DataTexture(shades, shades.length, 1, RedFormat)
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.needsUpdate = true
  return texture
})()

export const toon = (parameters: MeshToonMaterialParameters = {}) =>
  new MeshToonMaterial({ gradientMap: toonRamp, ...parameters })
