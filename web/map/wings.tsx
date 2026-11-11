import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { BoxGeometry, Color, Object3D, type InstancedMesh } from 'three'
import { toonRamp } from './paint'
import type { Placement } from './sprites'

const most = 64
const box = new BoxGeometry(1, 1, 1)
const colors = ['#e8524a', '#f2b632', '#4aa3df', '#5fbf6b', '#b06ad9', '#f28c38'].map(
  (hex) => new Color(hex),
)
const lines = new Color('#f4f1ea')
const above = 1.75
const parts = [
  { side: 0, drop: 0, size: [0.8, 0.07, 0.5], line: false },
  { side: -0.62, drop: 0.1, size: [0.5, 0.07, 0.44], line: false },
  { side: 0.62, drop: 0.1, size: [0.5, 0.07, 0.44], line: false },
  { side: -0.55, drop: 0.75, size: [0.015, 1.2, 0.015], line: true },
  { side: 0.55, drop: 0.75, size: [0.015, 1.2, 0.015], line: true },
] as const

export function Wings({
  placements,
  soaring,
}: {
  placements: { current: (Placement | null)[] }
  soaring: { current: Float32Array }
}) {
  const mesh = useRef<InstancedMesh>(null)
  const dummy = useRef(new Object3D())
  useFrame(() => {
    const wings = mesh.current
    if (!wings) return
    let n = 0
    placements.current.forEach((placement, i) => {
      const yaw = soaring.current[i]!
      if (!placement || Number.isNaN(yaw) || n >= most) return
      const [across, along] = [Math.cos(yaw), -Math.sin(yaw)]
      for (const part of parts) {
        const inward = part.line ? 0.45 : 1
        dummy.current.position.set(
          placement.x + across * part.side * inward,
          placement.ground + above - part.drop,
          placement.y + along * part.side * inward,
        )
        dummy.current.rotation.set(0, yaw, part.line ? -part.side * 0.5 : 0)
        dummy.current.scale.set(part.size[0], part.size[1], part.size[2])
        dummy.current.updateMatrix()
        const slot = n * parts.length + parts.indexOf(part)
        wings.setMatrixAt(slot, dummy.current.matrix)
        wings.setColorAt(slot, part.line ? lines : colors[i % colors.length]!)
      }
      n++
    })
    wings.count = n * parts.length
    wings.instanceMatrix.needsUpdate = true
    if (wings.instanceColor) wings.instanceColor.needsUpdate = true
  })
  return (
    <instancedMesh
      ref={mesh}
      args={[box, undefined, most * parts.length]}
      frustumCulled={false}
      castShadow
    >
      <meshToonMaterial gradientMap={toonRamp} />
    </instancedMesh>
  )
}
