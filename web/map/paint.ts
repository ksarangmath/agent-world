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

export const nightLights = `
vec3 lampColor(float pick) {
  return pick < 0.5 ? vec3(1.0, 0.62, 0.25)
    : pick < 0.68 ? vec3(1.0, 0.4, 0.1)
    : pick < 0.84 ? vec3(0.55, 0.8, 1.0)
    : pick < 0.91 ? vec3(0.1, 0.9, 0.75)
    : pick < 0.96 ? vec3(1.0, 0.22, 0.5)
    : vec3(0.5, 0.3, 1.0);
}
vec3 neonColor(float pick) {
  return pick < 0.2 ? vec3(1.0, 0.1, 0.45)
    : pick < 0.4 ? vec3(0.05, 0.85, 1.0)
    : pick < 0.55 ? vec3(1.0, 0.45, 0.05)
    : pick < 0.7 ? vec3(0.45, 1.0, 0.2)
    : pick < 0.85 ? vec3(0.55, 0.25, 1.0)
    : vec3(1.0, 0.15, 0.12);
}
`

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
