import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Color, type DirectionalLight, type HemisphereLight } from 'three'
import { getPosition } from 'suncalc'

const sanFrancisco = { latitude: 37.7749, longitude: -122.4194 }
const day = new Color('#7ab8e8')
const dusk = new Color('#e8956a')
const night = new Color('#0e1630')

export function Sky({ center }: { center: { x: number; y: number } }) {
  const sun = useRef<DirectionalLight>(null)
  const ambient = useRef<HemisphereLight>(null)
  const sky = useRef(new Color())
  useFrame((state) => {
    const position = getPosition(new Date(), sanFrancisco.latitude, sanFrancisco.longitude)
    const height = Math.sin(position.altitude)
    const daylight = Math.max(0, Math.min(1, (height + 0.1) / 0.4))
    const twilight = Math.max(0, 1 - Math.abs(height) / 0.2)
    sky.current
      .copy(night)
      .lerp(day, daylight)
      .lerp(dusk, twilight * 0.5)
    state.scene.background = sky.current
    if (sun.current) {
      const direction = position.azimuth + Math.PI
      sun.current.position.set(
        center.x + Math.sin(direction) * 100,
        Math.max(10, height * 120),
        center.y + Math.cos(direction) * 100,
      )
      sun.current.target.position.set(center.x, 0, center.y)
      sun.current.target.updateMatrixWorld()
      sun.current.intensity = 0.2 + daylight * 1.6
    }
    if (ambient.current) ambient.current.intensity = 0.5 + daylight * 1.2
  })
  return (
    <>
      <hemisphereLight ref={ambient} args={['#fff6e0', '#4a5a70', 1.6]} />
      <directionalLight ref={sun} intensity={1.6} />
    </>
  )
}
