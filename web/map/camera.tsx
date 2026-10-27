import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { MapControls } from 'three/examples/jsm/controls/MapControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPixelatedPass } from 'three/examples/jsm/postprocessing/RenderPixelatedPass.js'

const isometricOffset = 80

export function Camera({ target }: { target: { x: number; y: number } }) {
  const { camera, gl } = useThree()
  useEffect(() => {
    camera.position.set(target.x - isometricOffset, isometricOffset, target.y + isometricOffset)
    const controls = new MapControls(camera, gl.domElement)
    controls.target.set(target.x, 0, target.y)
    controls.enableRotate = false
    controls.screenSpacePanning = false
    controls.minZoom = 3
    controls.maxZoom = 48
    controls.update()
    return () => controls.dispose()
  }, [camera, gl, target.x, target.y])
  return null
}

export function PixelPass({ pixelSize }: { pixelSize: number }) {
  const { gl, scene, camera, size } = useThree()
  const composer = useMemo(() => {
    const effects = new EffectComposer(gl)
    effects.addPass(new RenderPixelatedPass(pixelSize, scene, camera))
    effects.addPass(new OutputPass())
    return effects
  }, [gl, scene, camera, pixelSize])
  useEffect(() => composer.setSize(size.width, size.height), [composer, size])
  useEffect(() => () => composer.dispose(), [composer])
  useFrame(() => composer.render(), 1)
  return null
}
