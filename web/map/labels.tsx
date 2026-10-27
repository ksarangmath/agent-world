import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Vector3 } from 'three'
import type { WorldPerson } from '../../shared/api'
import { places } from '../../shared/map/places'
import { surfaceAt } from './elevation'
import { neighborhoods } from './neighborhoods'

type Label = {
  text: string
  x: number
  y: number
  lift: number
  kind: 'area' | 'place'
  zooms: [number, number]
}

const areas = neighborhoods.filter((neighborhood) => neighborhood.label)
const areaCount = areas.length

const labels: Label[] = [
  ...areas.map((neighborhood): Label => ({
    text: neighborhood.name,
    x: neighborhood.x,
    y: neighborhood.y,
    lift: 2,
    kind: 'area',
    zooms: neighborhood.label === 'major' ? [1, 10] : [4, 10],
  })),
  ...places.map((place): Label => ({
    text: place.name,
    x: place.center.x + 0.5,
    y: place.center.y + 0.5,
    lift: 1.6,
    kind: 'place',
    zooms: [18, Infinity],
  })),
]

export function Labels({ people }: { people: WorldPerson[] }) {
  const { gl, camera, size } = useThree()
  const elements = useRef<HTMLDivElement[]>([])
  const projected = useMemo(() => new Vector3(), [])
  const counts = useMemo(() => {
    const here = new Map<string, number>()
    for (const person of people) {
      if (!person.trip) here.set(person.placeId, (here.get(person.placeId) ?? 0) + 1)
    }
    return here
  }, [people])

  useEffect(() => {
    const container = gl.domElement.parentElement
    elements.current = labels.map((label) => {
      const element = document.createElement('div')
      element.className = `${label.kind}-label`
      element.textContent = label.text
      container?.appendChild(element)
      return element
    })
    return () => elements.current.forEach((element) => element.remove())
  }, [gl])

  useEffect(() => {
    places.forEach((place, i) => {
      const element = elements.current[areaCount + i]
      if (element) element.dataset.count = String(counts.get(place.id) ?? 0)
    })
  }, [counts])

  useFrame(() => {
    labels.forEach((label, i) => {
      const element = elements.current[i]
      if (!element) return
      const [low, high] = label.zooms
      projected.set(label.x, surfaceAt(label.x, label.y) + label.lift, label.y).project(camera)
      const busy = label.kind === 'place' && element.dataset.count !== '0'
      const visible =
        camera.zoom >= (busy ? 9 : low) &&
        camera.zoom < high &&
        Math.abs(projected.x) < 1.05 &&
        Math.abs(projected.y) < 1.05
      element.style.display = visible ? 'block' : 'none'
      if (visible) {
        element.style.transform = `translate(${((projected.x + 1) / 2) * size.width}px, ${((1 - projected.y) / 2) * size.height}px) translate(-50%, -100%)`
      }
    })
  })
  return null
}
