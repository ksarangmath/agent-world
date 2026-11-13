import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { Vector3, type OrthographicCamera } from 'three'
import { mapHeight, mapWidth } from '../../shared/map/grid'
import { detailZoom, showDetail, view, viewFrom } from './clock'
import { surfaceAt } from './decks'
import { revealAt } from './sightlines'
import { steer } from './watching'

const distance = 800
const idleFrameInterval = 1000 / 30
const movingFor = 100
const panSpeed = 1000
const zoomSpeed = 1.5
const flightSeconds = 0.7
const watchZoom = 30
const dragPixels = 5
const trackEase = 0.12
const zoomRange = { min: 1.4, max: 140 }
const wheel = {
  perHundredPixels: 0.95,
  pinchBoost: 10,
  linePixels: 16,
  pagePixels: 100,
  sameGestureMs: 200,
}
const glide = { tilesPerSecond: 9, shortest: 5, longest: 16, dipPerTile: 1 / 120, deepest: 0.7 }

export type Focus = { x: number; y: number; zoom: number }

type Rig = {
  camera: OrthographicCamera
  surface: HTMLElement
  x: number
  y: number
  movedAt: number
}
type Pinch = Event & { scale: number; clientX: number; clientY: number }

let active: Rig | null = null
const flight = {
  start: -1,
  seconds: flightSeconds,
  dip: 0,
  from: { x: 0, y: 0, zoom: 1 },
  to: { x: 0, y: 0, zoom: 1 },
}
const held = new Set<string>()

const lens = new Vector3()
const aim = new Vector3()

function place(rig: Rig, x: number, y: number, zoom = rig.camera.zoom) {
  rig.x = Math.min(mapWidth, Math.max(0, x))
  rig.y = Math.min(mapHeight, Math.max(0, y))
  rig.camera.position.set(
    rig.x + viewFrom.x * distance,
    viewFrom.y * distance,
    rig.y + viewFrom.z * distance,
  )
  rig.camera.zoom = Math.min(zoomRange.max, Math.max(zoomRange.min, zoom))
  rig.camera.updateProjectionMatrix()
  rig.camera.updateMatrixWorld()
  rig.movedAt = performance.now()
}

function groundAt(rig: Rig, clientX: number, clientY: number) {
  const box = rig.surface.getBoundingClientRect()
  lens
    .set(((clientX - box.left) / box.width) * 2 - 1, 1 - ((clientY - box.top) / box.height) * 2, -1)
    .unproject(rig.camera)
  rig.camera.getWorldDirection(aim)
  const reach = -lens.y / aim.y
  return { x: lens.x + aim.x * reach, y: lens.z + aim.z * reach }
}

function carry(rig: Rig, from: [x: number, y: number], to = from, factor = 1) {
  const held = groundAt(rig, ...from)
  place(rig, rig.x, rig.y, rig.camera.zoom * factor)
  const now = groundAt(rig, ...to)
  place(rig, rig.x + held.x - now.x, rig.y + held.y - now.y)
}

export const stopFlight = () => {
  flight.start = -1
}

const sightOf = (x: number, y: number, height = surfaceAt(x, y)) => ({
  x: x - (viewFrom.x * height) / viewFrom.y,
  y: y - (viewFrom.z * height) / viewFrom.y,
})

export function glideTo(x: number, y: number, zoom: number) {
  if (!active) return 0
  const at = sightOf(x, y)
  const far = Math.hypot(at.x - active.x, at.y - active.y)
  const seconds = Math.min(glide.longest, Math.max(glide.shortest, far / glide.tilesPerSecond))
  fly(at.x, at.y, zoom, seconds, Math.min(glide.deepest, far * glide.dipPerTile))
  return seconds
}

export function flyTo(x: number, y: number, zoom: number) {
  const at = sightOf(x, y)
  fly(at.x, at.y, zoom)
}

function fly(x: number, y: number, zoom: number, seconds = flightSeconds, dip = 0) {
  if (!active) return
  const from = { x: active.x, y: active.y, zoom: active.camera.zoom }
  const to = {
    x: Math.min(mapWidth, Math.max(0, x)),
    y: Math.min(mapHeight, Math.max(0, y)),
    zoom: Math.min(zoomRange.max, Math.max(zoomRange.min, zoom)),
  }
  Object.assign(flight, { start: performance.now() / 1000, seconds, dip, from, to })
}

export function closeIn(x: number, y: number, height: number) {
  const at = sightOf(x, y, height)
  if (active) fly(at.x, at.y, Math.max(active.camera.zoom, watchZoom))
}

export function track(x: number, y: number, height: number) {
  if (!active) return
  const at = sightOf(x, y, height)
  if (flight.start >= 0) {
    Object.assign(flight.to, at)
    return
  }
  place(active, active.x + (at.x - active.x) * trackEase, active.y + (at.y - active.y) * trackEase)
}

export function zoomBy(factor: number) {
  if (!active) return
  const from = flight.start < 0 ? { x: active.x, y: active.y, zoom: active.camera.zoom } : flight.to
  fly(from.x, from.y, from.zoom * factor)
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
  if (event.code in pans) steer()
}

const onKeyUp = (event: KeyboardEvent) => held.delete(event.code)
const releaseKeys = () => held.clear()

export function Camera({ focus }: { focus: Focus }) {
  const get = useThree((state) => state.get)
  useEffect(() => {
    const { gl, advance } = get()
    const camera = get().camera as OrthographicCamera
    const surface = gl.domElement.parentElement!
    const rig: Rig = { camera, surface, x: focus.x, y: focus.y, movedAt: -Infinity }
    place(rig, focus.x, focus.y, focus.zoom)
    camera.lookAt(rig.x, 0, rig.y)
    camera.updateMatrixWorld()
    active = rig

    const fingers = new Map<number, { x: number; y: number }>()
    let travelled = 0
    const move = (event: PointerEvent) => {
      const finger = fingers.get(event.pointerId)
      if (!finger) return
      if (event.pointerType === 'mouse' && event.buttons === 0) return lift(event)
      const [other] = [...fingers.values()].filter((each) => each !== finger)
      const before = other ? Math.hypot(finger.x - other.x, finger.y - other.y) : 0
      const after = other ? Math.hypot(event.clientX - other.x, event.clientY - other.y) : 0
      const middle = (x: number, y: number): [number, number] =>
        other ? [(x + other.x) / 2, (y + other.y) / 2] : [x, y]
      const wasDragging = travelled >= dragPixels
      travelled += Math.hypot(event.clientX - finger.x, event.clientY - finger.y)
      if (!wasDragging && travelled >= dragPixels) steer()
      carry(
        rig,
        middle(finger.x, finger.y),
        middle(event.clientX, event.clientY),
        before > 0 && after > 0 ? after / before : 1,
      )
      finger.x = event.clientX
      finger.y = event.clientY
    }
    const lift = (event: PointerEvent) => {
      if (!fingers.delete(event.pointerId) || fingers.size > 0) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', lift)
      window.removeEventListener('pointercancel', lift)
    }
    const press = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      if (fingers.size === 0) {
        travelled = 0
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', lift)
        window.addEventListener('pointercancel', lift)
      }
      fingers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      stopFlight()
    }
    const afterDrag = (event: MouseEvent) => {
      if (event.detail === 0 || travelled < dragPixels) return
      event.stopPropagation()
      event.preventDefault()
    }
    const scrolled = { x: 0, y: 0, at: -Infinity }
    const scroll = (event: WheelEvent) => {
      event.preventDefault()
      if (event.timeStamp - scrolled.at > wheel.sameGestureMs) {
        scrolled.x = event.clientX
        scrolled.y = event.clientY
      }
      scrolled.at = event.timeStamp
      const unit =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? wheel.linePixels
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? wheel.pagePixels
            : 1
      const pixels = event.deltaY * unit * (event.ctrlKey ? wheel.pinchBoost : 1)
      stopFlight()
      carry(rig, [scrolled.x, scrolled.y], undefined, wheel.perHundredPixels ** (pixels / 100))
    }
    let pinched = 1
    const pinchStart = () => {
      pinched = 1
    }
    const pinch = (event: Event) => {
      if (fingers.size > 0) return
      const { scale, clientX, clientY } = event as Pinch
      stopFlight()
      carry(rig, [clientX, clientY], undefined, scale / pinched)
      pinched = scale
    }
    const touchAction = surface.style.touchAction
    surface.style.touchAction = 'none'
    surface.addEventListener('pointerdown', press)
    surface.addEventListener('click', afterDrag, true)
    surface.addEventListener('wheel', scroll, { passive: false })
    surface.addEventListener('gesturestart', pinchStart)
    surface.addEventListener('gesturechange', pinch)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', releaseKeys)
    let drawnAt = -Infinity
    let frame = requestAnimationFrame(function draw(now) {
      frame = requestAnimationFrame(draw)
      const moving = held.size > 0 || flight.start >= 0 || now - rig.movedAt < movingFor
      if (!moving && now - drawnAt < idleFrameInterval - 2) return
      drawnAt = now
      advance(now / 1000)
    })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', releaseKeys)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', lift)
      window.removeEventListener('pointercancel', lift)
      releaseKeys()
      active = null
      stopFlight()
      surface.style.touchAction = touchAction
      surface.removeEventListener('pointerdown', press)
      surface.removeEventListener('click', afterDrag, true)
      surface.removeEventListener('wheel', scroll)
      surface.removeEventListener('gesturestart', pinchStart)
      surface.removeEventListener('gesturechange', pinch)
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
      place(
        active,
        active.x + (fx * up - fy * right) * step,
        active.y + (fy * up + fx * right) * step,
        camera.zoom * 2 ** (zoom * zoomSpeed * seconds),
      )
      return
    }
    if (flight.start < 0) return
    const t = Math.min(1, (performance.now() / 1000 - flight.start) / flight.seconds)
    const eased = t * t * (3 - 2 * t)
    const { from, to } = flight
    place(
      active,
      from.x + (to.x - from.x) * eased,
      from.y + (to.y - from.y) * eased,
      from.zoom * (to.zoom / from.zoom) ** eased * (1 - flight.dip * Math.sin(Math.PI * t)),
    )
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
