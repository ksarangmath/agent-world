import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Color, Matrix4, Object3D, Vector3, type InstancedMesh } from 'three'
import type { WorldPerson } from '../../shared/api'
import { positionOnRoute, route } from '../../shared/map/route'
import { humanoidParts, partKeys, strideAngle, strideRate, type PartKey } from '../humanoid/model'

const capacity = 2000
const scale = 0.9
const hidden = new Matrix4().makeScale(0, 0, 0)

type Props = { people: WorldPerson[]; serverOffsetMs: number }

export function People({ people, serverOffsetMs }: Props) {
  const meshes = useRef<Partial<Record<PartKey, InstancedMesh | null>>>({})
  const headings = useRef(new Map<string, { heading: number; x: number; y: number }>())
  const tags = useRef(new Map<string, HTMLAnchorElement>())
  const { gl, camera, size } = useThree()
  const shown = useMemo(() => people.slice(0, capacity), [people])
  const trips = useMemo(
    () => shown.map((person) => (person.trip ? route(person.trip.from, person.tile) : null)),
    [shown],
  )
  const parts = useMemo(
    () => shown.map((person) => humanoidParts(person.avatar, person.conversationId !== null)),
    [shown],
  )

  useLayoutEffect(() => {
    const color = new Color()
    for (const key of partKeys) {
      const mesh = meshes.current[key]
      if (!mesh) continue
      parts.forEach((part, i) => mesh.setColorAt(i, color.set(part[key]?.color ?? '#000000')))
      mesh.count = shown.length
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  }, [parts, shown.length])

  useEffect(() => {
    const container = gl.domElement.parentElement
    const current = tags.current
    for (const person of shown) {
      const tag = current.get(person.id) ?? document.createElement('a')
      tag.className = 'name-tag'
      tag.textContent = person.name
      tag.href = `/people/${person.id}`
      if (!current.has(person.id)) container?.appendChild(tag)
      current.set(person.id, tag)
    }
    for (const [id, tag] of current) {
      if (!shown.some((person) => person.id === id)) {
        tag.remove()
        current.delete(id)
      }
    }
  }, [gl, shown])
  useEffect(() => {
    const current = tags.current
    return () => current.forEach((tag) => tag.remove())
  }, [])

  const body = useMemo(() => new Object3D(), [])
  const local = useMemo(() => new Matrix4(), [])
  const pivot = useMemo(() => new Matrix4(), [])
  const matrix = useMemo(() => new Matrix4(), [])
  const stretch = useMemo(() => new Vector3(), [])
  const projected = useMemo(() => new Vector3(), [])

  useFrame(({ clock }) => {
    const now = Date.now() + serverOffsetMs
    const stride = Math.sin(clock.elapsedTime * strideRate)
    shown.forEach((person, i) => {
      let { x, y } = person.tile
      let walking = false
      const trip = trips[i]
      if (trip && person.trip) {
        const elapsed = (now - Date.parse(person.trip.departedAt)) / 1000
        if (elapsed < trip.seconds) {
          const position = positionOnRoute(trip, elapsed)
          ;({ x, y } = position)
          walking = position.mode === 'walk'
        }
      }
      const facing = headings.current.get(person.id) ?? { heading: 0, x, y }
      const heading =
        x !== facing.x || y !== facing.y ? Math.atan2(x - facing.x, y - facing.y) : facing.heading
      headings.current.set(person.id, { heading, x, y })
      body.position.set(x + 0.5, walking ? Math.abs(stride) * 0.04 : 0, y + 0.5)
      body.rotation.set(0, heading, 0)
      body.scale.setScalar(scale)
      body.updateMatrix()
      for (const key of partKeys) {
        const mesh = meshes.current[key]
        const part = parts[i]![key]
        if (!mesh) continue
        if (!part) {
          mesh.setMatrixAt(i, hidden)
          continue
        }
        local.makeTranslation(...part.offset).scale(stretch.set(...part.size))
        if (part.limb) {
          const swing = walking ? stride * strideAngle * part.limb.side : 0
          local.premultiply(pivot.makeRotationX(swing))
          local.premultiply(pivot.makeTranslation(...part.limb.pivot))
        }
        mesh.setMatrixAt(i, matrix.multiplyMatrices(body.matrix, local))
      }
      const tag = tags.current.get(person.id)
      if (tag) {
        projected.set(x + 0.5, 1.6, y + 0.5).project(camera)
        tag.style.display =
          Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1 ? 'block' : 'none'
        tag.style.transform = `translate(${((projected.x + 1) / 2) * size.width}px, ${((1 - projected.y) / 2) * size.height}px) translate(-50%, -100%)`
      }
    })
    for (const key of partKeys) {
      const mesh = meshes.current[key]
      if (mesh) mesh.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <>
      {partKeys.map((key) => (
        <instancedMesh
          key={key}
          ref={(mesh) => {
            meshes.current[key] = mesh
          }}
          args={[undefined, undefined, capacity]}
          frustumCulled={false}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshLambertMaterial />
        </instancedMesh>
      ))}
    </>
  )
}
