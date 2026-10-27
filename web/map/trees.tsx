import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  IcosahedronGeometry,
  MeshLambertMaterial,
  Object3D,
  type InstancedMesh,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { treeKinds, type Tree, type TreeKind } from './city'
import { chunked } from './clock'
import { hash } from './elevation'
import { colored } from './paint'

const trunk = (height: number, width = 0.12, hex = '#6b4a32') =>
  colored(new BoxGeometry(width, height, width).translate(0, height / 2, 0), hex)

const shapes: Record<TreeKind, BufferGeometry> = {
  round: mergeGeometries([
    trunk(0.45),
    colored(new IcosahedronGeometry(0.42, 0).translate(0, 0.75, 0), '#4f8a3c'),
  ]),
  cypress: mergeGeometries([
    trunk(0.5, 0.14),
    colored(new IcosahedronGeometry(0.5, 0).scale(1.3, 0.55, 1).translate(0, 0.8, 0), '#2f5e3c'),
  ]),
  pine: mergeGeometries([
    trunk(0.3),
    colored(new ConeGeometry(0.38, 1.1, 6).translate(0, 0.85, 0), '#2e6a3f'),
  ]),
  redwood: mergeGeometries([
    trunk(0.6, 0.16, '#7a3f2a'),
    colored(new ConeGeometry(0.42, 2.2, 6).translate(0, 1.5, 0), '#2a5532'),
  ]),
  palm: mergeGeometries([
    trunk(1.2, 0.08, '#8a6a46'),
    colored(new BoxGeometry(0.9, 0.06, 0.18).translate(0, 1.22, 0), '#4c8a3a'),
    colored(new BoxGeometry(0.18, 0.06, 0.9).translate(0, 1.22, 0), '#4c8a3a'),
  ]),
}

const material = new MeshLambertMaterial({ vertexColors: true, flatShading: true })

function Chunk({ trees, kind }: { trees: Tree[]; kind: TreeKind }) {
  const mesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const dummy = new Object3D()
    const tint = new Color()
    trees.forEach((tree, i) => {
      dummy.position.set(tree.x, tree.base, tree.y)
      dummy.rotation.set(0, hash(tree.x * 10, tree.y * 10) * Math.PI * 2, 0)
      dummy.scale.setScalar(tree.size)
      dummy.updateMatrix()
      mesh.current!.setMatrixAt(i, dummy.matrix)
      const shade = 0.85 + 0.3 * hash(tree.y * 10, tree.x * 10)
      mesh.current!.setColorAt(i, tint.setRGB(shade, shade, shade))
    })
    mesh.current!.instanceMatrix.needsUpdate = true
    if (mesh.current!.instanceColor) mesh.current!.instanceColor.needsUpdate = true
    mesh.current!.computeBoundingSphere()
  }, [trees])
  return <instancedMesh ref={mesh} args={[shapes[kind], material, trees.length]} />
}

export function Trees({ trees }: { trees: Tree[] }) {
  const chunks = useMemo(
    () =>
      treeKinds.flatMap((kind) =>
        chunked(trees.filter((tree) => tree.kind === kind)).map((list) => ({ kind, list })),
      ),
    [trees],
  )
  return chunks.map(({ kind, list }) => (
    <Chunk key={`${kind}${list[0]!.x},${list[0]!.y}`} kind={kind} trees={list} />
  ))
}
