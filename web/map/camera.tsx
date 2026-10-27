import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { Vector3 } from 'three'
import { MapControls } from 'three/examples/jsm/controls/MapControls.js'
import { mapHeight, mapWidth } from '../../shared/map/grid'
import { view } from './clock'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPixelatedPass } from 'three/examples/jsm/postprocessing/RenderPixelatedPass.js'

const viewFrom = { x: -0.34, y: 0.84, z: 0.94 }
const distance = 800

export type Focus = { x: number; y: number; zoom: number }

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
    controls.minZoom = 0.8
    controls.maxZoom = 64
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
    controls.addEventListener('change', keepInside)
    controls.update()
    return () => {
      controls.removeEventListener('change', keepInside)
      controls.dispose()
    }
  }, [get, focus.x, focus.y, focus.zoom])
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

export function PixelPass({ pixelSize }: { pixelSize: number }) {
  const { gl, scene, camera, size } = useThree()
  const composer = useMemo(() => {
    const effects = new EffectComposer(gl)
    effects.addPass(
      new RenderPixelatedPass(pixelSize, scene, camera, {
        normalEdgeStrength: 0.25,
        depthEdgeStrength: 0.35,
      }),
    )
    effects.addPass(new OutputPass())
    return effects
  }, [gl, scene, camera, pixelSize])
  useEffect(() => composer.setSize(size.width, size.height), [composer, size])
  useEffect(() => () => composer.dispose(), [composer])
  useFrame(() => composer.render(), 1)
  return null
}
