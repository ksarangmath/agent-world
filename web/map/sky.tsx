import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import { Color, type DirectionalLight, type HemisphereLight } from 'three'
import { getPosition } from 'suncalc'
import { sky, view } from './clock'

const sanFrancisco = { latitude: 37.7749, longitude: -122.4194 }
const day = new Color('#9fd3ee')
const dusk = new Color('#f4a27a')
const night = new Color('#141a3a')
const noon = new Color('#ffe2b6')
const evening = new Color('#ff9f6e')
const moon = new Color('#8fa4ff')
const daySky = new Color('#fff0dc')
const nightSky = new Color('#6a78c4')
const dayGround = new Color('#6c5f8a')
const nightGround = new Color('#231f48')
const radians = Math.PI / 180
const sunDistance = 400
const longestShadows = 0.62
const sunBearing = 125 * radians

export function Sky() {
  const sun = useRef<DirectionalLight>(null)
  const ambient = useRef<HemisphereLight>(null)
  const background = useRef(new Color())
  useLayoutEffect(() => {
    const light = sun.current!
    light.castShadow = true
    light.shadow.autoUpdate = false
    light.shadow.mapSize.set(2048, 2048)
    light.shadow.bias = -0.00005
    light.shadow.normalBias = 0.06
    light.shadow.camera.near = 1
    light.shadow.camera.far = sunDistance * 2.5
  }, [])
  useFrame((state) => {
    const position = getPosition(new Date(), sanFrancisco.latitude, sanFrancisco.longitude)
    const height = Math.sin(position.altitude * radians)
    const daylight = Math.max(0, Math.min(1, (height + 0.08) / 0.3))
    const twilight = Math.max(0, 1 - Math.abs(height) / 0.2)
    sky.time.value = state.clock.elapsedTime
    sky.daylight.value = daylight
    background.current
      .copy(night)
      .lerp(day, daylight)
      .lerp(dusk, twilight * 0.5)
    state.scene.background = background.current
    const light = sun.current
    if (light) {
      const [x, z] = [(view.left + view.right) / 2, (view.top + view.bottom) / 2]
      const half = Math.max(view.right - view.left, view.bottom - view.top) * 0.6
      const rise = Math.max(0.25, Math.min(longestShadows, height))
      const across = Math.sqrt(1 - rise * rise)
      light.position.set(
        x + Math.sin(sunBearing) * across * sunDistance,
        rise * sunDistance,
        z - Math.cos(sunBearing) * across * sunDistance,
      )
      light.target.position.set(x, 0, z)
      light.target.updateMatrixWorld()
      light.shadow.needsUpdate = true
      const camera = light.shadow.camera
      if (camera.right !== half) {
        Object.assign(camera, { left: -half, right: half, top: half, bottom: -half })
        camera.updateProjectionMatrix()
      }
      light.intensity = 0.45 + daylight * 2.25
      light.color
        .copy(moon)
        .lerp(evening, Math.min(1, daylight + twilight))
        .lerp(noon, Math.max(0, Math.min(1, daylight * 1.4 - twilight * 0.4)))
    }
    const hemisphere = ambient.current
    if (hemisphere) {
      hemisphere.intensity = 0.7 + daylight * 1.4
      hemisphere.color.copy(nightSky).lerp(daySky, daylight)
      hemisphere.groundColor.copy(nightGround).lerp(dayGround, daylight)
    }
  })
  return (
    <>
      <hemisphereLight ref={ambient} />
      <directionalLight ref={sun} intensity={2.6} />
    </>
  )
}
