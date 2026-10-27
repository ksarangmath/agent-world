import { Canvas } from '@react-three/fiber'
import { useCallback, useMemo } from 'react'
import { Color, Euler, Quaternion, Vector3, type Matrix4 } from 'three'
import type { Avatar } from '../../shared/profile'
import { PixelPass } from '../map/pixel'
import { Figures } from './Figures'
import { figure, standing } from './model'

const backdrop = new Color('#f2dfb8')
const portraitPixel = 2.25
const [origin, turn, angle, unit] = [
  new Vector3(),
  new Quaternion(),
  new Euler(),
  new Vector3(1, 1, 1),
]

export default function Preview({ avatar }: { avatar: Avatar }) {
  const figures = useMemo(() => [figure(avatar, { talking: false })], [avatar])
  const place = useCallback((_: number, body: Matrix4) => {
    const t = performance.now() / 1000
    body.compose(
      origin.set(0, 0.004 * Math.sin(t * 1.6), 0),
      turn.setFromEuler(angle.set(0, 0.22 + 0.1 * Math.sin(t * 0.35), 0)),
      unit,
    )
    return standing
  }, [])
  return (
    <Canvas
      camera={{ position: [0, 1.02, 2.6], fov: 10 }}
      dpr={[1, 2]}
      gl={{ antialias: false }}
      scene={{ background: backdrop }}
      onCreated={({ camera }) => camera.lookAt(0, 1.0, 0)}
    >
      <hemisphereLight args={['#f6f2ff', '#7a6a8a', 1.4]} />
      <directionalLight position={[1.4, 2.2, 2.4]} intensity={2.7} color="#fff7ee" />
      <Figures figures={figures} place={place} />
      <PixelPass pixel={portraitPixel} outline={0.6} />
    </Canvas>
  )
}
