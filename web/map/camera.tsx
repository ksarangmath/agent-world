import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { Vector3, type OrthographicCamera } from 'three'
import { MapControls } from 'three/examples/jsm/controls/MapControls.js'
import { mapHeight, mapWidth } from '../../shared/map/grid'
import { view } from './clock'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPixelatedPass } from 'three/examples/jsm/postprocessing/RenderPixelatedPass.js'

const viewFrom = { x: -0.34, y: 0.84, z: 0.94 }
const distance = 800

export type Focus = { x: number; y: number; zoom: number }

const flightSeconds = 0.7
let active: MapControls | null = null
const flight = { start: -1, from: { x: 0, y: 0, zoom: 1 }, to: { x: 0, y: 0, zoom: 1 } }

const zoomOf = (controls: MapControls) => (controls.object as OrthographicCamera).zoom

export function flyTo(x: number, y: number, zoom: number) {
  if (!active) return
  const from = { x: active.target.x, y: active.target.z, zoom: zoomOf(active) }
  const to = {
    x: Math.min(mapWidth, Math.max(0, x)),
    y: Math.min(mapHeight, Math.max(0, y)),
    zoom: Math.min(active.maxZoom, Math.max(active.minZoom, zoom)),
  }
  Object.assign(flight, { start: performance.now() / 1000, from, to })
}

const forward = { x: -viewFrom.x, y: -viewFrom.z }
const forwardLength = Math.sqrt(forward.x ** 2 + forward.y ** 2)
const panPixels = 160

function heading() {
  if (!active) return null
  const destination = flight.start < 0 ? null : flight.to
  return destination ?? { x: active.target.x, y: active.target.z, zoom: zoomOf(active) }
}

export function nudge(right: number, up: number) {
  const from = heading()
  if (!from) return
  const step = panPixels / from.zoom
  const [fx, fy] = [forward.x / forwardLength, forward.y / forwardLength]
  flyTo(from.x + (fx * up - fy * right) * step, from.y + (fy * up + fx * right) * step, from.zoom)
}

export function zoomBy(factor: number) {
  const from = heading()
  if (from) flyTo(from.x, from.y, from.zoom * factor)
}

const keys: Record<string, () => void> = {
  ArrowUp: () => nudge(0, 1),
  KeyW: () => nudge(0, 1),
  ArrowDown: () => nudge(0, -1),
  KeyS: () => nudge(0, -1),
  ArrowLeft: () => nudge(-1, 0),
  KeyA: () => nudge(-1, 0),
  ArrowRight: () => nudge(1, 0),
  KeyD: () => nudge(1, 0),
  Equal: () => zoomBy(1.6),
  NumpadAdd: () => zoomBy(1.6),
  Minus: () => zoomBy(1 / 1.6),
  NumpadSubtract: () => zoomBy(1 / 1.6),
}

function onKey(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  const typing = target?.closest('input, textarea, select, [contenteditable="true"]')
  const action = keys[event.code]
  if (!action || typing || event.metaKey || event.ctrlKey || event.altKey) return
  event.preventDefault()
  action()
}

export function Camera({ focus }: { focus: Focus }) {
  const get = useThree((state) => state.get)
  useEffect(() => {
    const { camera, gl } = get()
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
    controls.maxZoom = 96
    controls.zoomToCursor = true
    const keepInside = () => {
      const { target } = controls
      const [x, z] = [
        Math.min(mapWidth, Math.max(0, target.x)) - target.x,
        Math.min(mapHeight, Math.max(0, target.z)) - target.z,
      ]
      if (!x && !z) return
      target.x += x
      target.z += z
      camera.position.x += x
      camera.position.z += z
    }
    const cancelFlight = () => {
      flight.start = -1
    }
    controls.addEventListener('change', keepInside)
    controls.addEventListener('start', cancelFlight)
    controls.update()
    active = controls
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      active = null
      cancelFlight()
      controls.removeEventListener('change', keepInside)
      controls.removeEventListener('start', cancelFlight)
      controls.dispose()
    }
  }, [get, focus.x, focus.y, focus.zoom])
  useFrame(({ camera }) => {
    if (!active || flight.start < 0) return
    const t = Math.min(1, (performance.now() / 1000 - flight.start) / flightSeconds)
    const eased = t * t * (3 - 2 * t)
    const { from, to } = flight
    const [x, y] = [from.x + (to.x - from.x) * eased, from.y + (to.y - from.y) * eased]
    const [dx, dz] = [x - active.target.x, y - active.target.z]
    active.target.x += dx
    active.target.z += dz
    camera.position.x += dx
    camera.position.z += dz
    camera.zoom = from.zoom * (to.zoom / from.zoom) ** eased
    camera.updateProjectionMatrix()
    active.update()
    if (t === 1) flight.start = -1
  })
  return null
}

const near = new Vector3()
const far = new Vector3()
const margin = 6
const tallest = 30

export function VisibleArea() {
  useFrame(({ camera }) => {
    let [left, right, top, bottom] = [Infinity, -Infinity, Infinity, -Infinity]
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
        const [gx, gz] = [near.x + (far.x - near.x) * t, near.z + (far.z - near.z) * t]
        ;[left, right, top, bottom] = [
          Math.min(left, gx),
          Math.max(right, gx),
          Math.min(top, gz),
          Math.max(bottom, gz),
        ]
      }
    }
    Object.assign(view, {
      left: left - margin,
      right: right + margin,
      top: top - margin,
      bottom: bottom + margin,
    })
  })
  return null
}

const artPixel = 1.5

export function PixelPass() {
  const { gl, scene, camera, size } = useThree()
  const composer = useMemo(() => {
    const effects = new EffectComposer(gl)
    effects.addPass(
      new RenderPixelatedPass(
        Math.max(2, Math.round(artPixel * gl.getPixelRatio())),
        scene,
        camera,
        {
          normalEdgeStrength: 0.25,
          depthEdgeStrength: 0.35,
        },
      ),
    )
    effects.addPass(new OutputPass())
    return effects
  }, [gl, scene, camera])
  useEffect(() => composer.setSize(size.width, size.height), [composer, size])
  useEffect(() => () => composer.dispose(), [composer])
  useFrame(() => composer.render(), 1)
  return null
}
