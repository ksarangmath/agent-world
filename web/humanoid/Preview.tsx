import { Canvas, useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'
import type { Avatar } from '../../shared/profile'
import { Humanoid } from './model'

function Turntable({ avatar }: { avatar: Avatar }) {
  const group = useRef<Group>(null)
  const walking = useRef(false)
  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.8
  })
  return (
    <group ref={group} position={[0, -0.6, 0]}>
      <Humanoid avatar={avatar} walking={walking} />
    </group>
  )
}

export default function Preview({ avatar }: { avatar: Avatar }) {
  return (
    <Canvas camera={{ position: [0, 0.6, 2.4], fov: 35 }}>
      <hemisphereLight args={['#fff6e0', '#4a5a70', 2]} />
      <directionalLight position={[2, 3, 2]} intensity={1.5} />
      <Turntable avatar={avatar} />
    </Canvas>
  )
}
