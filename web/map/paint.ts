import { Color, Float32BufferAttribute, type BufferGeometry } from 'three'

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
