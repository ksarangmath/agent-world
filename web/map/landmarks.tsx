import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  Color,
  MeshBasicMaterial,
  Object3D,
  type Group,
  type InstancedMesh,
} from 'three'
import { sky } from './clock'
import { toon } from './paint'
import { bridges } from './landmarks/bridgeworks'
import { icons, windmillSite } from './landmarks/icons'
import { shapes, type Light, type Part, type Shape } from './landmarks/shapes'

const bridgework = bridges()
const landmarks = icons()
const parts = [...bridgework.parts, ...landmarks.parts]
const lights = [...bridgework.lights, ...landmarks.lights]

export const reservedTiles: ReadonlySet<number> = landmarks.reserved

const solidMaterial = toon()
const lightMaterial = new MeshBasicMaterial()
const lightGeometry = new BoxGeometry(0.16, 0.16, 0.16)
const sailMaterial = toon({ color: '#efe9dc' })
const spokeMaterial = toon({ color: '#6b4a34' })

function Solids({ shape, list }: { shape: Shape; list: Part[] }) {
  const mesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const color = new Color()
    list.forEach((part, i) => {
      mesh.current!.setMatrixAt(i, part.matrix)
      mesh.current!.setColorAt(i, color.set(part.color))
    })
    mesh.current!.instanceMatrix.needsUpdate = true
    if (mesh.current!.instanceColor) mesh.current!.instanceColor.needsUpdate = true
    mesh.current!.computeBoundingSphere()
  }, [list])
  return (
    <instancedMesh
      ref={mesh}
      args={[shapes[shape], solidMaterial, list.length]}
      castShadow
      receiveShadow
    />
  )
}

function Lights({ list }: { list: Light[] }) {
  const mesh = useRef<InstancedMesh>(null)
  const colors = useMemo(() => list.map((light) => new Color(light.color)), [list])
  const level = useMemo(() => new Color(), [])
  useLayoutEffect(() => {
    const dummy = new Object3D()
    list.forEach((light, i) => {
      dummy.position.set(...light.position)
      dummy.updateMatrix()
      mesh.current!.setMatrixAt(i, dummy.matrix)
      mesh.current!.setColorAt(i, colors[i]!)
    })
    mesh.current!.instanceMatrix.needsUpdate = true
    mesh.current!.computeBoundingSphere()
  }, [list, colors])
  useFrame(() => {
    const lights = mesh.current!
    const night = 1 - sky.daylight.value
    lights.visible = night > 0.05
    if (!lights.visible) return
    const now = Date.now() / 1000
    list.forEach((light, i) => {
      let brightness = night
      if (light.blink) brightness *= Math.sin(now * Math.PI * light.blink) > 0 ? 1 : 0.15
      if (light.shimmer !== undefined) {
        brightness *= 0.3 + 0.7 * Math.max(0, Math.sin(now * 2.2 - light.shimmer * 0.45))
      }
      lights.setColorAt(i, level.copy(colors[i]!).multiplyScalar(brightness))
    })
    lights.instanceColor!.needsUpdate = true
  })
  return <instancedMesh ref={mesh} args={[lightGeometry, lightMaterial, list.length]} />
}

function Windmill() {
  const sails = useRef<Group>(null)
  useFrame(() => {
    sails.current!.rotation.x = (Date.now() / 1000) * 0.8
  })
  return (
    <group
      ref={sails}
      position={[windmillSite.x - 0.72, windmillSite.ground + 2.45, windmillSite.y]}
    >
      {[0, 1, 2, 3].map((k) => (
        <group key={k} rotation-x={(k * Math.PI) / 2}>
          <mesh material={spokeMaterial} position={[0, 1.1, 0]}>
            <boxGeometry args={[0.05, 2.2, 0.08]} />
          </mesh>
          <mesh material={sailMaterial} position={[0, 1.25, 0.18]}>
            <boxGeometry args={[0.03, 1.7, 0.32]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

const byShape = Object.keys(shapes).map((shape) => ({
  shape: shape as Shape,
  list: parts.filter((part) => part.shape === shape),
}))

export function Landmarks() {
  return (
    <>
      {byShape.map(({ shape, list }) =>
        list.length ? <Solids key={shape} shape={shape} list={list} /> : null,
      )}
      <Lights list={lights} />
      <Windmill />
    </>
  )
}
