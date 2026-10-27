import { useEffect, useMemo } from 'react'
import {
  BufferGeometry,
  DataTexture,
  Float32BufferAttribute,
  NearestFilter,
  RGBAFormat,
  SRGBColorSpace,
} from 'three'
import { mapHeight, mapWidth } from '../../shared/map/grid'
import { chunkSize, sky } from './clock'
import { toon } from './paint'
import { columns, heights, rows, vertexStep } from './elevation'

const markings = `
uniform vec2 mapSize;
uniform float time;
varying vec3 vGround;
float roadClass(vec2 tile) {
  return floor((1.0 - texture2D(map, (tile + 0.5) / mapSize).a) * 12.75 + 0.5);
}
float grainHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float cloudNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(grainHash(i), grainHash(i + vec2(1.0, 0.0)), u.x), mix(grainHash(i + vec2(0.0, 1.0)), grainHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void markGround(inout vec4 color) {
  vec2 tile = floor(vGround.xz);
  vec2 f = fract(vGround.xz);
  float detail = clamp(0.12 / max(fwidth(vGround.x), 1e-4) - 1.0, 0.0, 1.0);
  float here = roadClass(tile);
  float east = step(0.5, roadClass(tile + vec2(1.0, 0.0)));
  float west = step(0.5, roadClass(tile - vec2(1.0, 0.0)));
  float south = step(0.5, roadClass(tile + vec2(0.0, 1.0)));
  float north = step(0.5, roadClass(tile - vec2(0.0, 1.0)));
  vec3 paint = color.rgb;
  if (here > 0.5) {
    float alongX = step(0.5, east + west) * (1.0 - north) * (1.0 - south);
    float alongZ = step(0.5, north + south) * (1.0 - east) * (1.0 - west);
    float dashX = step(abs(f.y - 0.5), 0.05) * step(fract(vGround.x * 0.5), 0.5) * alongX;
    float dashZ = step(abs(f.x - 0.5), 0.05) * step(fract(vGround.z * 0.5), 0.5) * alongZ;
    vec3 line = here > 2.5 ? vec3(0.92) : vec3(0.95, 0.78, 0.25);
    paint = mix(paint, line, step(1.5, here) * max(dashX, dashZ));
  } else {
    float curb = max(max(east * step(0.86, f.x), west * step(f.x, 0.14)), max(south * step(0.86, f.y), north * step(f.y, 0.14)));
    paint = mix(paint, vec3(0.86, 0.84, 0.8), curb * 0.55);
  }
  paint *= 0.95 + 0.1 * grainHash(floor(vGround.xz * 5.0));
  color.rgb = mix(color.rgb, paint, detail);
  vec2 drift = vGround.xz * 0.03 + vec2(time * 0.02, time * 0.008);
  float cloud = smoothstep(0.58, 0.74, 0.65 * cloudNoise(drift) + 0.35 * cloudNoise(drift * 2.3));
  color.rgb *= 1.0 - 0.2 * cloud;
  color.a = 1.0;
}
`

const chunkVertices = chunkSize / vertexStep

function chunkGeometry(firstColumn: number, firstRow: number): BufferGeometry | null {
  const [lastColumn, lastRow] = [
    Math.min(columns - 1, firstColumn + chunkVertices),
    Math.min(rows - 1, firstRow + chunkVertices),
  ]
  const width = lastColumn - firstColumn + 1
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const at = (column: number, row: number) =>
    heights[
      Math.min(rows - 1, Math.max(0, row)) * columns + Math.min(columns - 1, Math.max(0, column))
    ]!
  for (let row = firstRow; row <= lastRow; row++) {
    for (let column = firstColumn; column <= lastColumn; column++) {
      const [x, z] = [column * vertexStep, row * vertexStep]
      const slopeX = (at(column + 1, row) - at(column - 1, row)) / (2 * vertexStep)
      const slopeZ = (at(column, row + 1) - at(column, row - 1)) / (2 * vertexStep)
      const length = Math.sqrt(slopeX * slopeX + 1 + slopeZ * slopeZ)
      positions.push(x, heights[row * columns + column]!, z)
      normals.push(-slopeX / length, 1 / length, -slopeZ / length)
      uvs.push(x / mapWidth, z / mapHeight)
    }
  }
  const indices: number[] = []
  for (let row = 0; row < lastRow - firstRow; row++) {
    for (let column = 0; column < lastColumn - firstColumn; column++) {
      const [a, b, c, d] = [
        row * width + column,
        row * width + column + 1,
        (row + 1) * width + column,
        (row + 1) * width + column + 1,
      ]
      if ([a, b, c, d].every((v) => positions[v * 3 + 1]! < 0)) continue
      indices.push(a, c, b, b, c, d)
    }
  }
  if (!indices.length) return null
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeBoundingSphere()
  return geometry
}

function terrainChunks(): BufferGeometry[] {
  const chunks: BufferGeometry[] = []
  for (let row = 0; row < rows - 1; row += chunkVertices) {
    for (let column = 0; column < columns - 1; column += chunkVertices) {
      const chunk = chunkGeometry(column, row)
      if (chunk) chunks.push(chunk)
    }
  }
  return chunks
}

export function Ground({ pixels }: { pixels: Uint8Array }) {
  const chunks = useMemo(() => terrainChunks(), [])
  const material = useMemo(() => {
    const texture = new DataTexture(pixels, mapWidth, mapHeight, RGBAFormat)
    texture.magFilter = NearestFilter
    texture.minFilter = NearestFilter
    texture.colorSpace = SRGBColorSpace
    texture.needsUpdate = true
    const material = toon({ map: texture })
    material.onBeforeCompile = (shader) => {
      shader.uniforms.mapSize = { value: [mapWidth, mapHeight] }
      shader.uniforms.time = sky.time
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGround;')
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvGround = (modelMatrix * vec4(transformed, 1.0)).xyz;',
        )
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <map_pars_fragment>', `#include <map_pars_fragment>\n${markings}`)
        .replace('#include <map_fragment>', '#include <map_fragment>\nmarkGround(diffuseColor);')
    }
    return material
  }, [pixels])
  useEffect(() => () => chunks.forEach((chunk) => chunk.dispose()), [chunks])
  useEffect(() => () => (material.map?.dispose(), material.dispose()), [material])
  return chunks.map((chunk) => (
    <mesh key={chunk.uuid} geometry={chunk} material={material} receiveShadow />
  ))
}
