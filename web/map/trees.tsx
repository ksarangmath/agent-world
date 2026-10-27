import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  IcosahedronGeometry,
  Object3D,
  type InstancedMesh,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { treeKinds, type Tree, type TreeKind } from './city'
import { chunked } from './clock'
import { hash } from './elevation'
import { colored, toon } from './paint'
import { seeThrough } from './sightlines'

const trunk = (height: number, width = 0.12, hex = '#6b4a32') =>
  colored(new BoxGeometry(width, height, width).translate(0, height / 2, 0), hex)

const shapes: Record<TreeKind, BufferGeometry> = {
  round: mergeGeometries([
    trunk(0.45),
    colored(new IcosahedronGeometry(0.44, 0).translate(0, 0.78, 0), '#4caf50'),
  ]),
  cypress: mergeGeometries([
    trunk(0.5, 0.14),
    colored(new IcosahedronGeometry(0.5, 0).scale(1.3, 0.55, 1).translate(0, 0.8, 0), '#2e7d4f'),
  ]),
  pine: mergeGeometries([
    trunk(0.3),
    colored(new ConeGeometry(0.38, 1.1, 6).translate(0, 0.85, 0), '#2f8a4f'),
  ]),
  redwood: mergeGeometries([
    trunk(1.4, 0.28, '#8b3a1e'),
    colored(new ConeGeometry(0.62, 3.2, 7).translate(0, 2.6, 0), '#2a6b3a'),
    colored(new ConeGeometry(0.48, 2.2, 7).translate(0, 3.6, 0), '#33804a'),
  ]),
  palm: mergeGeometries([
    trunk(1.2, 0.08, '#8a6a46'),
    colored(new BoxGeometry(0.9, 0.06, 0.18).translate(0, 1.22, 0), '#3fae4a'),
    colored(new BoxGeometry(0.18, 0.06, 0.9).translate(0, 1.22, 0), '#3fae4a'),
  ]),
  oak: mergeGeometries([
    trunk(0.4, 0.18, '#6b4a32'),
    colored(
      new IcosahedronGeometry(0.62, 0).scale(1.25, 0.8, 1.25).translate(0, 0.85, 0),
      '#5e9e3a',
    ),
  ]),
  blossom: mergeGeometries([
    trunk(0.4, 0.1, '#7a4f3a'),
    colored(new IcosahedronGeometry(0.42, 0).translate(0, 0.72, 0), '#f7a8c8'),
  ]),
}

const material = toon({ vertexColors: true })
material.onBeforeCompile = seeThrough

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
  return <instancedMesh ref={mesh} args={[shapes[kind], material, trees.length]} castShadow />
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
