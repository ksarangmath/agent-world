import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Color, type DirectionalLight, type HemisphereLight } from 'three'
import { getPosition } from 'suncalc'
import { sky } from './clock'

const sanFrancisco = { latitude: 37.7749, longitude: -122.4194 }
const day = new Color('#8cc8f0')
const dusk = new Color('#f0a070')
const night = new Color('#0b1430')
const noon = new Color('#fff4e0')
const radians = Math.PI / 180

export function Sky({ center }: { center: { x: number; y: number } }) {
  const sun = useRef<DirectionalLight>(null)
  const ambient = useRef<HemisphereLight>(null)
  const background = useRef(new Color())
  useFrame((state) => {
    const position = getPosition(new Date(), sanFrancisco.latitude, sanFrancisco.longitude)
    const height = Math.sin(position.altitude * radians)
    const daylight = Math.max(0, Math.min(1, (height + 0.08) / 0.3))
    const twilight = Math.max(0, 1 - Math.abs(height) / 0.15)
    sky.time.value = state.clock.elapsedTime
    sky.daylight.value = daylight
    background.current
      .copy(night)
      .lerp(day, daylight)
      .lerp(dusk, twilight * 0.45)
    state.scene.background = background.current
    if (sun.current) {
      const bearing = position.azimuth * radians
      sun.current.position.set(
        center.x + Math.sin(bearing) * 300,
        Math.max(60, height * 400),
        center.y - Math.cos(bearing) * 300,
      )
      sun.current.target.position.set(center.x, 0, center.y)
      sun.current.target.updateMatrixWorld()
      sun.current.intensity = 0.25 + daylight * 2.6
      sun.current.color.copy(dusk).lerp(noon, Math.min(1, daylight * 1.5))
    }
    if (ambient.current) ambient.current.intensity = 0.7 + daylight * 1.9
  })
  return (
    <>
      <hemisphereLight ref={ambient} args={['#e8f0ff', '#7a6a50', 2.6]} />
      <directionalLight ref={sun} intensity={2.8} />
    </>
  )
}
