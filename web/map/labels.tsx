import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Vector3 } from 'three'
import { warp } from '../../shared/map/grid'
import { places, regionNames, type Region } from '../../shared/map/places'
import { surfaceAt } from './elevation'
import { neighborhoods } from './neighborhoods'

type Label = {
  text: string
  x: number
  y: number
  lift: number
  kind: 'region' | 'area' | 'place'
  zooms: [number, number]
}

const areas = neighborhoods.filter((neighborhood) => neighborhood.label)

const regionAnchors: Record<Region, [lon: number, lat: number]> = {
  sf: [-122.44, 37.765],
  marin: [-122.55, 37.9],
  east_bay: [-122.22, 37.83],
  south_bay: [-122.08, 37.4],
}

const labels: Label[] = [
  ...Object.entries(regionAnchors).map(([region, [lon, lat]]): Label => {
    const [x, y] = warp(lon, lat)
    return { text: regionNames[region as Region], x, y, lift: 4, kind: 'region', zooms: [0, 3.5] }
  }),
  ...areas.map((neighborhood): Label => ({
    text: neighborhood.name,
    x: neighborhood.x,
    y: neighborhood.y,
    lift: 2,
    kind: 'area',
    zooms: neighborhood.label === 'major' ? [3.5, 12] : [8, 12],
  })),
  ...places.map((place): Label => ({
    text: place.name,
    x: place.center.x + 0.5,
    y: place.center.y + 0.5,
    lift: 1.6,
    kind: 'place',
    zooms: [7, Infinity],
  })),
]

export function Labels() {
  const { gl, camera, size } = useThree()
  const elements = useRef<HTMLDivElement[]>([])
  const projected = useMemo(() => new Vector3(), [])

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

  useFrame(() => {
    labels.forEach((label, i) => {
      const element = elements.current[i]
      if (!element) return
      const [low, high] = label.zooms
      projected.set(label.x, surfaceAt(label.x, label.y) + label.lift, label.y).project(camera)
      const visible =
        camera.zoom >= low &&
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
