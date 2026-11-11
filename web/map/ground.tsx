import { useEffect, useMemo } from 'react'
import {
  BufferGeometry,
  DataTexture,
  Float32BufferAttribute,
  LinearFilter,
  LinearMipmapLinearFilter,
  NearestFilter,
  RGBAFormat,
  SRGBColorSpace,
} from 'three'
import { mapHeight, mapWidth } from '../../shared/map/grid'
import { chunkSize, sky } from './clock'
import { nightLights, toon } from './paint'
import { roadField } from './roads'
import { columns, heights, rows, vertexStep } from './elevation'

const markings = `
uniform vec2 mapSize;
uniform sampler2D roadField;
uniform float time;
uniform float daylight;
varying vec3 vGround;
vec3 streetGlow = vec3(0.0);
${nightLights}
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
  vec4 road = texture2D(roadField, vGround.xz / mapSize);
  float middle = abs(road.r * 2.0 - 1.0);
  float edge = road.g - 0.5;
  float junction = road.b * 2.0;
  float asphalt = 1.0 - step(0.0, edge);
  float walk = max(step(0.5, here), 1.0 - step(0.2, edge)) * (1.0 - asphalt);
  vec3 paint = color.rgb;
  vec3 tarmac = here > 2.5 ? vec3(0.21, 0.22, 0.27) : here > 1.5 ? vec3(0.16, 0.17, 0.21) : vec3(0.18, 0.18, 0.22);
  vec2 slab = fract(vGround.xz * 3.0);
  vec3 pavement = vec3(0.62, 0.58, 0.52) * (1.0 - 0.12 * step(0.86, max(slab.x, slab.y)));
  vec3 curb = vec3(0.78, 0.76, 0.72);
  paint = mix(paint, pavement, walk);
  paint = mix(paint, curb, walk * (1.0 - step(0.05, edge)));
  paint = mix(paint, tarmac, asphalt);
  float open = step(0.95, junction);
  vec3 line = here > 2.5 ? vec3(0.9) : vec3(0.95, 0.74, 0.2);
  float dash = step(1.5, here) * (1.0 - step(0.045, middle)) * step(0.5, road.a) * open;
  float shoulder = step(2.5, here) * step(-0.09, edge) * (1.0 - step(-0.05, edge)) * open;
  paint = mix(paint, line, asphalt * max(dash, shoulder));
  if (here > 0.5 || asphalt > 0.5) {
    vec3 lamp = here > 2.5 ? vec3(0.8, 0.88, 1.0) : mix(vec3(1.0, 0.6, 0.26), lampColor(district(tile).x), 0.45);
    float pool = smoothstep(0.5, 0.85, cloudNoise(vGround.xz * 0.9 + 7.0));
    float door = min(
      min(east + length(f - vec2(1.0, 0.5)), west + length(f - vec2(0.0, 0.5))),
      min(south + length(f - vec2(0.5, 1.0)), north + length(f - vec2(0.5, 0.0)))
    );
    float shop = grainHash(tile + 91.0);
    vec3 neon = neonColor(fract(shop * 17.0)) * step(shop, 0.3) * (1.0 - smoothstep(0.1, 0.55, door));
    streetGlow = lamp * (0.14 - 0.1 * detail + 0.1 * pool * detail) + neon * 0.16 * detail;
  } else {
    float spill = max(max(east * f.x, west * (1.0 - f.x)), max(south * f.y, north * (1.0 - f.y)));
    streetGlow = vec3(1.0, 0.6, 0.26) * 0.08 * smoothstep(0.4, 1.0, spill);
  }
  streetGlow *= 1.0 - daylight;
  float texels = clamp(0.8 / max(fwidth(vGround.x * 12.0), 1e-4) - 1.0, 0.0, 1.0);
  vec2 texel = floor(vGround.xz * 12.0);
  float speck = grainHash(texel);
  float paved = max(asphalt, walk);
  float grassy = (1.0 - paved) * smoothstep(0.03, 0.12, paint.g - max(paint.r, paint.b));
  float tuft = max(step(0.9, speck), step(0.92, grainHash(texel + vec2(-1.0, 1.0))));
  vec3 textured = paint * (0.96 + 0.08 * speck) * (1.0 - 0.2 * grassy * tuft);
  textured = mix(textured, paint * 1.18 + 0.02, grassy * step(0.975, grainHash(texel + 31.0)));
  vec3 petal = mix(vec3(1.0, 0.86, 0.42), vec3(0.98, 0.6, 0.72), step(0.5, grainHash(texel + 5.0)));
  textured = mix(textured, petal, grassy * step(0.994, grainHash(texel + 71.0)));
  paint = mix(mix(paint * (0.95 + 0.1 * grainHash(floor(vGround.xz * 5.0))), textured, texels), paint, paved);
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
    const field = roadField()
    const roads = new DataTexture(field.data, field.width, field.height, RGBAFormat)
    roads.magFilter = LinearFilter
    roads.minFilter = LinearMipmapLinearFilter
    roads.generateMipmaps = true
    roads.needsUpdate = true
    const material = toon({ map: texture })
    material.userData.roads = roads
    material.onBeforeCompile = (shader) => {
      shader.uniforms.mapSize = { value: [mapWidth, mapHeight] }
      shader.uniforms.roadField = { value: roads }
      shader.uniforms.time = sky.time
      shader.uniforms.daylight = sky.daylight
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGround;')
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvGround = (modelMatrix * vec4(transformed, 1.0)).xyz;',
        )
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <map_pars_fragment>', `#include <map_pars_fragment>\n${markings}`)
        .replace('#include <map_fragment>', '#include <map_fragment>\nmarkGround(diffuseColor);')
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\ntotalEmissiveRadiance += streetGlow;',
        )
    }
    return material
  }, [pixels])
  useEffect(() => () => chunks.forEach((chunk) => chunk.dispose()), [chunks])
  useEffect(
    () => () => (material.map?.dispose(), material.userData.roads.dispose(), material.dispose()),
    [material],
  )
  return chunks.map((chunk) => (
    <mesh key={chunk.uuid} geometry={chunk} material={material} receiveShadow />
  ))
}
