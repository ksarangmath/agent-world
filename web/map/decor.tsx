import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, Object3D, type BufferGeometry, type InstancedMesh, type Material } from 'three'
import type { City } from './city'
import { sky } from './clock'
import { Creatures } from './decor/creatures'
import { glowKits, litKits } from './decor/kits'
import { glowMaterial, litMaterial } from './decor/materials'
import { scatter, type Placed } from './decor/scatter'

const region = 128

function grouped<K extends string>(items: Placed<K>[]) {
  const groups = new Map<string, { kit: K; items: Placed<K>[] }>()
  for (const item of items) {
    const key = `${item.kit}:${Math.floor(item.x / region)}:${Math.floor(item.y / region)}`
    const group = groups.get(key)
    if (group) group.items.push(item)
    else groups.set(key, { kit: item.kit, items: [item] })
  }
  return [...groups.entries()]
}

function Props<K extends string>({
  items,
  geometry,
  material,
}: {
  items: Placed<K>[]
  geometry: BufferGeometry
  material: Material
}) {
  const mesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const instances = mesh.current!
    const dummy = new Object3D()
    const color = new Color()
    items.forEach((item, i) => {
      dummy.position.set(item.x, item.base, item.y)
      dummy.rotation.set(0, item.yaw, 0)
      dummy.scale.set(...item.size)
      dummy.updateMatrix()
      instances.setMatrixAt(i, dummy.matrix)
      instances.setColorAt(i, color.set(item.tint))
    })
    instances.instanceMatrix.needsUpdate = true
    instances.instanceColor!.needsUpdate = true
    instances.computeBoundingSphere()
  }, [items])
  return <instancedMesh ref={mesh} args={[geometry, material, items.length]} castShadow />
}

export function Decor({ city }: { city: City }) {
  const scattered = useMemo(() => scatter(city), [city])
  const lit = useMemo(() => grouped(scattered.lit), [scattered])
  const glow = useMemo(() => grouped(scattered.glow), [scattered])
  useFrame(() => {
    glowMaterial.color.setScalar(0.8 + 0.9 * (1 - sky.daylight.value))
  })
  return (
    <>
      {lit.map(([key, { kit, items }]) => (
        <Props key={key} items={items} geometry={litKits[kit]} material={litMaterial} />
      ))}
      {glow.map(([key, { kit, items }]) => (
        <Props key={key} items={items} geometry={glowKits[kit]} material={glowMaterial} />
      ))}
      <Creatures {...scattered} />
    </>
  )
}
