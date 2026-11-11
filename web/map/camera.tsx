import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { Vector3, type OrthographicCamera } from 'three'
import { MapControls } from 'three/examples/jsm/controls/MapControls.js'
import { mapHeight, mapWidth } from '../../shared/map/grid'
import { detailZoom, showDetail, view, viewFrom } from './clock'
import { revealAt } from './sightlines'

const distance = 800
const idleFrameInterval = 1000 / 30
const movingFor = 100
const panSpeed = 1000
const zoomSpeed = 1.5
const flightSeconds = 0.7
const glide = { tilesPerSecond: 9, shortest: 5, longest: 16, dipPerTile: 1 / 120, deepest: 0.7 }

export type Focus = { x: number; y: number; zoom: number }

let active: MapControls | null = null
const flight = {
  start: -1,
  seconds: flightSeconds,
  dip: 0,
  from: { x: 0, y: 0, zoom: 1 },
  to: { x: 0, y: 0, zoom: 1 },
}
const held = new Set<string>()

const zoomOf = (controls: MapControls) => (controls.object as OrthographicCamera).zoom

function moveBy(controls: MapControls, dx: number, dz: number) {
  controls.target.x += dx
  controls.target.z += dz
  controls.object.position.x += dx
  controls.object.position.z += dz
}

export const stopFlight = () => {
  flight.start = -1
}

export function glideTo(x: number, y: number, zoom: number) {
  if (!active) return 0
  const far = Math.hypot(x - active.target.x, y - active.target.z)
  const seconds = Math.min(glide.longest, Math.max(glide.shortest, far / glide.tilesPerSecond))
  flyTo(x, y, zoom, seconds, Math.min(glide.deepest, far * glide.dipPerTile))
  return seconds
}

export function flyTo(x: number, y: number, zoom: number, seconds = flightSeconds, dip = 0) {
  if (!active) return
  const from = { x: active.target.x, y: active.target.z, zoom: zoomOf(active) }
  const to = {
    x: Math.min(mapWidth, Math.max(0, x)),
    y: Math.min(mapHeight, Math.max(0, y)),
    zoom: Math.min(active.maxZoom, Math.max(active.minZoom, zoom)),
  }
  Object.assign(flight, { start: performance.now() / 1000, seconds, dip, from, to })
}

export function zoomBy(factor: number) {
  if (!active) return
  const from =
    flight.start < 0 ? { x: active.target.x, y: active.target.z, zoom: zoomOf(active) } : flight.to
  flyTo(from.x, from.y, from.zoom * factor)
}

const forwardLength = Math.hypot(viewFrom.x, viewFrom.z)
const [fx, fy] = [-viewFrom.x / forwardLength, -viewFrom.z / forwardLength]

const pans: Record<string, [right: number, up: number]> = {
  ArrowUp: [0, 1],
  KeyW: [0, 1],
  ArrowDown: [0, -1],
  KeyS: [0, -1],
  ArrowLeft: [-1, 0],
  KeyA: [-1, 0],
  ArrowRight: [1, 0],
  KeyD: [1, 0],
}
const zooms: Record<string, number> = { Equal: 1, NumpadAdd: 1, Minus: -1, NumpadSubtract: -1 }
const keyCodes = new Set([...Object.keys(pans), ...Object.keys(zooms)])

function onKeyDown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  const typing = target?.closest('input, textarea, select, [contenteditable="true"], .overlay')
  if (typing || event.metaKey || event.ctrlKey || event.altKey) {
    held.clear()
    return
  }
  if (!keyCodes.has(event.code)) return
  event.preventDefault()
  held.add(event.code)
  flight.start = -1
}

const onKeyUp = (event: KeyboardEvent) => held.delete(event.code)
const releaseKeys = () => held.clear()

export function Camera({ focus }: { focus: Focus }) {
  const get = useThree((state) => state.get)
  useEffect(() => {
    const { camera, gl, advance } = get()
    camera.position.set(
      focus.x + viewFrom.x * distance,
      viewFrom.y * distance,
      focus.y + viewFrom.z * distance,
    )
    camera.zoom = focus.zoom
    camera.updateProjectionMatrix()
    const controls = new MapControls(camera, gl.domElement)
    controls.target.set(focus.x, 0, focus.y)
    controls.enableRotate = false
    controls.screenSpacePanning = false
    controls.minZoom = 1.4
    controls.maxZoom = 140
    controls.zoomToCursor = true
    const keepInside = () => {
      const { target } = controls
      moveBy(
        controls,
        Math.min(mapWidth, Math.max(0, target.x)) - target.x,
        Math.min(mapHeight, Math.max(0, target.z)) - target.z,
      )
    }
    let movedAt = -Infinity
    let drawnAt = -Infinity
    const moved = () => {
      movedAt = performance.now()
    }
    controls.addEventListener('change', keepInside)
    controls.addEventListener('change', moved)
    controls.addEventListener('start', stopFlight)
    controls.update()
    active = controls
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', releaseKeys)
    let frame = requestAnimationFrame(function draw(now) {
      frame = requestAnimationFrame(draw)
      const moving = held.size > 0 || flight.start >= 0 || now - movedAt < movingFor
      if (!moving && now - drawnAt < idleFrameInterval - 2) return
      drawnAt = now
      advance(now / 1000)
    })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', releaseKeys)
      releaseKeys()
      active = null
      stopFlight()
      controls.removeEventListener('change', keepInside)
      controls.removeEventListener('change', moved)
      controls.removeEventListener('start', stopFlight)
      controls.dispose()
    }
  }, [get, focus.x, focus.y, focus.zoom])
  useFrame(({ camera }, delta) => {
    if (!active) return
    if (held.size > 0) {
      let [right, up, zoom] = [0, 0, 0]
      for (const code of held) {
        const [r, u] = pans[code] ?? [0, 0]
        right += r
        up += u
        zoom += zooms[code] ?? 0
      }
      const seconds = Math.min(delta, 0.1)
      const step = (panSpeed * seconds) / camera.zoom / (Math.hypot(right, up) || 1)
      moveBy(active, (fx * up - fy * right) * step, (fy * up + fx * right) * step)
      camera.zoom = Math.min(
        active.maxZoom,
        Math.max(active.minZoom, camera.zoom * 2 ** (zoom * zoomSpeed * seconds)),
      )
      camera.updateProjectionMatrix()
      active.update()
      return
    }
    if (flight.start < 0) return
    const t = Math.min(1, (performance.now() / 1000 - flight.start) / flight.seconds)
    const eased = t * t * (3 - 2 * t)
    const { from, to } = flight
    const [x, y] = [from.x + (to.x - from.x) * eased, from.y + (to.y - from.y) * eased]
    moveBy(active, x - active.target.x, y - active.target.z)
    camera.zoom = Math.max(
      active.minZoom,
      from.zoom * (to.zoom / from.zoom) ** eased * (1 - flight.dip * Math.sin(Math.PI * t)),
    )
    camera.updateProjectionMatrix()
    active.update()
    if (t === 1) flight.start = -1
  })
  return null
}

const near = new Vector3()
const far = new Vector3()
const corner = new Vector3()
const gaze = new Vector3()
const margin = 6
const tallest = 30

export function VisibleArea() {
  useFrame(({ camera }) => {
    let [left, right, top, bottom] = [Infinity, -Infinity, Infinity, -Infinity]
    let [closest, farthest] = [Infinity, -Infinity]
    camera.getWorldDirection(gaze)
    for (const [x, y] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      for (const height of [0, tallest]) {
        near.set(x, y, -1).unproject(camera)
        far.set(x, y, 1).unproject(camera)
        const t = (height - near.y) / (far.y - near.y)
        corner.lerpVectors(near, far, t)
        ;[left, right, top, bottom] = [
          Math.min(left, corner.x),
          Math.max(right, corner.x),
          Math.min(top, corner.z),
          Math.max(bottom, corner.z),
        ]
        const depth = corner.sub(camera.position).dot(gaze)
        ;[closest, farthest] = [Math.min(closest, depth), Math.max(farthest, depth)]
      }
    }
    Object.assign(view, {
      left: left - margin,
      right: right + margin,
      top: top - margin,
      bottom: bottom + margin,
    })
    const [front, back] = [Math.max(1, closest - tallest), farthest + tallest]
    if (Math.abs(camera.near - front) + Math.abs(camera.far - back) > (back - front) * 0.05) {
      camera.near = front
      camera.far = back
      camera.updateProjectionMatrix()
    }
    revealAt(camera.zoom)
    showDetail(camera.zoom >= detailZoom)
  }, 0.5)
  return null
}
