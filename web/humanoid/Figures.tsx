import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Color, InstancedBufferAttribute, Matrix4, type InstancedMesh } from 'three'
import { articulate, castsShadow, materialFor, segments, type Figure, type Pose } from './model'
import { shape } from './shapes'

type Props = {
  figures: Figure[]
  place: (index: number, body: Matrix4) => Pose | null
  near?: () => boolean
}

type Entry = { figure: number; segment: number; r: number; g: number; b: number }
type Group = { id: string; entries: Entry[]; capacity: number; near: boolean }

const stride = segments.length * 16

function groupParts(figures: Figure[], near: boolean): Group[] {
  const color = new Color()
  const groups = new Map<string, Entry[]>()
  figures.forEach((figure, i) =>
    (near ? figure.near : figure.far).forEach((part) => {
      const entries = groups.get(part.shape) ?? []
      color.set(part.color)
      entries.push({ figure: i, segment: part.segment, r: color.r, g: color.g, b: color.b })
      groups.set(part.shape, entries)
    }),
  )
  return [...groups].map(([id, entries]) => ({
    id,
    entries,
    near,
    capacity: 2 ** Math.ceil(Math.log2(entries.length)),
  }))
}

export function Figures({ figures, place, near }: Props) {
  const groups = useMemo(
    () => [...groupParts(figures, true), ...groupParts(figures, false)],
    [figures],
  )
  const meshes = useRef(new Map<string, InstancedMesh>())
  const bones = useMemo(
    () => new Float32Array(Math.max(1, figures.length) * stride),
    [figures.length],
  )
  const shown = useMemo(() => new Uint8Array(figures.length), [figures.length])
  const body = useMemo(() => new Matrix4(), [])

  useFrame(({ clock }) => {
    figures.forEach((figure, i) => {
      const pose = place(i, body)
      shown[i] = pose ? 1 : 0
      if (pose) articulate(body, figure.build, pose, clock.elapsedTime, bones, i * stride)
    })
    const close = near?.() ?? true
    for (const group of groups) {
      const mesh = meshes.current.get(`${group.near}:${group.id}`)
      if (!mesh) continue
      let count = 0
      if (group.near === close) {
        const matrices = mesh.instanceMatrix.array as Float32Array
        const colors = mesh.instanceColor!.array as Float32Array
        for (const { figure, segment, r, g, b } of group.entries) {
          if (!shown[figure]) continue
          const from = figure * stride + segment * 16
          for (let k = 0; k < 16; k++) matrices[count * 16 + k] = bones[from + k]!
          colors[count * 3] = r
          colors[count * 3 + 1] = g
          colors[count * 3 + 2] = b
          count++
        }
        mesh.instanceMatrix.clearUpdateRanges()
        mesh.instanceMatrix.addUpdateRange(0, count * 16)
        mesh.instanceMatrix.needsUpdate = true
        mesh.instanceColor!.clearUpdateRanges()
        mesh.instanceColor!.addUpdateRange(0, count * 3)
        mesh.instanceColor!.needsUpdate = true
      }
      mesh.count = count
    }
  })

  return groups.map(({ id, capacity, near: close }) => (
    <instancedMesh
      key={`${close}:${id}#${capacity}`}
      ref={(mesh) => {
        if (!mesh) return
        mesh.instanceColor ??= new InstancedBufferAttribute(new Float32Array(capacity * 3), 3)
        meshes.current.set(`${close}:${id}`, mesh)
      }}
      args={[shape(id), materialFor(id), capacity]}
      castShadow={castsShadow(id)}
      frustumCulled={false}
    />
  ))
}
