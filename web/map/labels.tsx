import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Vector3 } from 'three'
import { warp } from '../../shared/map/grid'
import type { WorldPerson } from '../../shared/api'
import { places, regionNames, type Region } from '../../shared/map/places'
import { flyTo } from './camera'
import { surfaceAt } from './decks'
import { neighborhoods } from './neighborhoods'
import { visit, visiting } from './watching'

type Label = {
  text: string
  x: number
  y: number
  lift: number
  kind: 'region' | 'area'
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
]

const namesZoom = 7
const arrivalZoom = 30
const placeLift = 1.6
const pill = { width: 64, height: 32 }

type Gathering = { here: number; talking: boolean }

export function Labels({
  people,
  serverOffsetMs,
}: {
  people: WorldPerson[]
  serverOffsetMs: number
}) {
  const { gl, camera, size } = useThree()
  const elements = useRef<HTMLDivElement[]>([])
  const markers = useRef<HTMLButtonElement[]>([])
  const gatherings = useRef<Gathering[]>([])
  const busiest = useRef<number[]>([])
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
    markers.current = places.map((place) => {
      const marker = document.createElement('button')
      marker.type = 'button'
      marker.className = 'place-label'
      marker.title = place.name
      marker.append(document.createElement('span'), document.createElement('b'))
      marker.firstChild!.textContent = place.name
      marker.addEventListener('click', () => visit(place.center))
      container?.appendChild(marker)
      return marker
    })
    const stopVisiting = visiting.subscribe(() => {
      const tile = visiting.get()
      if (!tile) return
      visiting.set(null)
      flyTo(tile.x + 0.5, tile.y + 0.5, Math.max(camera.zoom, arrivalZoom))
    })
    return () => {
      stopVisiting()
      for (const element of [...elements.current, ...markers.current]) element.remove()
    }
  }, [gl, camera])

  useEffect(() => {
    const now = Date.now() + serverOffsetMs
    const byPlace = new Map<string, Gathering>()
    for (const person of people) {
      if (person.trip && Date.parse(person.trip.arrivesAt) > now) continue
      const held = byPlace.get(person.placeId)
      byPlace.set(person.placeId, {
        here: (held?.here ?? 0) + 1,
        talking: (held?.talking ?? false) || person.conversationId !== null,
      })
    }
    gatherings.current = places.map((place) => byPlace.get(place.id) ?? { here: 0, talking: false })
    busiest.current = places
      .map((_, i) => i)
      .sort((a, b) => gatherings.current[b]!.here - gatherings.current[a]!.here)
  }, [people, serverOffsetMs])

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
    const far = camera.zoom < namesZoom
    const shown: {
      x: number
      y: number
      name: string
      marker: HTMLButtonElement
      here: number
      talking: boolean
    }[] = []
    for (const i of busiest.current) {
      const [place, marker, gathering] = [places[i]!, markers.current[i], gatherings.current[i]!]
      if (!marker) continue
      const [x, y] = [place.center.x + 0.5, place.center.y + 0.5]
      projected.set(x, surfaceAt(x, y) + placeLift, y).project(camera)
      const [left, top] = [
        ((projected.x + 1) / 2) * size.width,
        ((1 - projected.y) / 2) * size.height,
      ]
      const visible =
        (!far || gathering.here > 0) && Math.abs(projected.x) < 1.05 && Math.abs(projected.y) < 1.05
      const joined = far
        ? shown.find(
            (other) =>
              Math.abs(other.x - left) < pill.width && Math.abs(other.y - top) < pill.height,
          )
        : undefined
      if (joined) {
        joined.here += gathering.here
        joined.talking ||= gathering.talking
      }
      marker.style.display = visible && !joined ? 'flex' : 'none'
      if (!visible || joined) continue
      marker.style.transform = `translate(${left}px, ${top}px) translate(-50%, -100%)`
      shown.push({
        x: left,
        y: top,
        name: place.name,
        marker,
        here: gathering.here,
        talking: gathering.talking,
      })
    }
    for (const { name, marker, here, talking } of shown) {
      const count = here > 0 ? String(here) : ''
      const spoken =
        here > 0
          ? `${name}: ${here} ${here === 1 ? 'person' : 'people'}${talking ? ', someone is talking' : ''}`
          : name
      if (marker.lastChild!.textContent !== count) marker.lastChild!.textContent = count
      if (marker.ariaLabel !== spoken) marker.ariaLabel = spoken
      marker.classList.toggle('far', far)
      marker.classList.toggle('talking', talking)
    }
  })
  return null
}
