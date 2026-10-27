import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  MeshLambertMaterial,
  Object3D,
  type InstancedMesh,
} from 'three'
import type { Building } from './city'
import { chunked, sky } from './clock'

const roofPitch = 0.38

const box = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0)

function prism() {
  const geometry = new BufferGeometry()
  const [l, r, f, b] = [-0.5, 0.5, 0.5, -0.5]
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute(
      [
        [l, 0, f, r, 0, f, 0, 1, f],
        [r, 0, b, l, 0, b, 0, 1, b],
        [l, 0, b, l, 0, f, 0, 1, f, l, 0, b, 0, 1, f, 0, 1, b],
        [r, 0, f, r, 0, b, 0, 1, b, r, 0, f, 0, 1, b, 0, 1, f],
      ].flat(),
      3,
    ),
  )
  geometry.computeVertexNormals()
  return geometry
}

const gable = prism()

function wallMaterial() {
  const material = new MeshLambertMaterial()
  material.onBeforeCompile = (shader) => {
    shader.uniforms.daylight = sky.daylight
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec3 roofColor;
varying vec3 vRoof;
varying vec3 vLocal;
varying vec3 vScale;
varying vec3 vBoxNormal;
varying float vSeed;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vRoof = roofColor;
vLocal = position;
vBoxNormal = normal;
vScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
vSeed = instanceMatrix[3].x * 0.137 + instanceMatrix[3].z * 0.713;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float daylight;
varying vec3 vRoof;
varying vec3 vLocal;
varying vec3 vScale;
varying vec3 vBoxNormal;
varying float vSeed;
float windowHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float glow = 0.0;
if (vBoxNormal.y > 0.5) {
  diffuseColor.rgb = vRoof;
} else if (vBoxNormal.y > -0.5) {
  float along = abs(vBoxNormal.x) > 0.5 ? (vLocal.z + 0.5) * vScale.z : (vLocal.x + 0.5) * vScale.x;
  float up = vLocal.y * vScale.y;
  vec2 cell = vec2(floor(along * 1.6), floor(up / 0.36));
  vec2 f = vec2(fract(along * 1.6), fract(up / 0.36));
  float detail = clamp(0.35 / max(fwidth(along * 1.6), 1e-4) - 1.0, 0.0, 1.0);
  float pane = step(0.25, f.x) * step(f.x, 0.75) * step(0.3, f.y) * step(f.y, 0.8) * step(0.2, up) * step(up, vScale.y - 0.1);
  float lit = step(0.5, windowHash(vec3(cell, vSeed)));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.25, 0.32), pane * 0.6 * detail);
  glow = mix(0.12, pane * lit, detail) * (1.0 - daylight);
}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += glow * vec3(1.0, 0.72, 0.38) * 1.4;`,
      )
  }
  return material
}

const walls = wallMaterial()
const roofs = new MeshLambertMaterial({ flatShading: true })

function Chunk({ buildings }: { buildings: Building[] }) {
  const bodies = useRef<InstancedMesh>(null)
  const gables = useRef<InstancedMesh>(null)
  const pitched = useMemo(() => buildings.filter((b) => b.gable !== 'none'), [buildings])
  const roofColors = useMemo(() => {
    const color = new Color()
    const values = new Float32Array(buildings.length * 3)
    buildings.forEach((b, i) =>
      color.set(b.gable === 'none' ? b.roof : b.wall).toArray(values, i * 3),
    )
    return new InstancedBufferAttribute(values, 3)
  }, [buildings])
  useLayoutEffect(() => {
    const dummy = new Object3D()
    const color = new Color()
    buildings.forEach((b, i) => {
      dummy.position.set(b.x + b.width / 2, b.base, b.y + b.depth / 2)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(b.width * 0.995, b.height, b.depth * 0.995)
      dummy.updateMatrix()
      bodies.current!.setMatrixAt(i, dummy.matrix)
      bodies.current!.setColorAt(i, color.set(b.wall))
    })
    pitched.forEach((b, i) => {
      dummy.position.set(b.x + b.width / 2, b.base + b.height, b.y + b.depth / 2)
      dummy.rotation.set(0, b.gable === 'x' ? Math.PI / 2 : 0, 0)
      dummy.scale.set(b.width * 0.995, roofPitch, b.depth * 0.995)
      dummy.updateMatrix()
      gables.current!.setMatrixAt(i, dummy.matrix)
      gables.current!.setColorAt(i, color.set(b.roof))
    })
    for (const mesh of [bodies.current!, gables.current!]) {
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.computeBoundingSphere()
    }
  }, [buildings, pitched])
  const geometry = useMemo(() => {
    const instanced = box.clone()
    instanced.setAttribute('roofColor', roofColors)
    return instanced
  }, [roofColors])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <>
      <instancedMesh ref={bodies} args={[geometry, walls, buildings.length]} />
      <instancedMesh
        ref={gables}
        args={[gable, roofs, Math.max(1, pitched.length)]}
        count={pitched.length}
      />
    </>
  )
}

export function Buildings({ buildings }: { buildings: Building[] }) {
  const chunks = useMemo(() => chunked(buildings), [buildings])
  return chunks.map((chunk) => <Chunk key={`${chunk[0]!.x},${chunk[0]!.y}`} buildings={chunk} />)
}
