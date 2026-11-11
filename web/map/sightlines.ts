import {
  DataTexture,
  FloatType,
  MeshBasicMaterial,
  NearestFilter,
  RedFormat,
  type Material,
  type WebGLProgramParametersWithUniforms,
} from 'three'
import { mapHeight, mapWidth } from '../../shared/map/grid'
import { places } from '../../shared/map/places'
import { spots } from '../../shared/map/spots'
import { viewFrom } from './clock'
import { surfaceAt } from './decks'

const reach = 14
const open = 1e4
const reveal = { value: 0 }
export const drawingNormals = { value: false }
let ceilings: DataTexture | undefined
let programs = 0

export function revealAt(zoom: number) {
  reveal.value = Math.min(1, Math.max(0, (zoom - 12) / 2))
}

const across = Math.hypot(viewFrom.x, viewFrom.z)
const [stepX, stepY, rise] = [viewFrom.x / across, viewFrom.z / across, viewFrom.y / across]
const everyMs = 120
let fixed: Float32Array | undefined
let walking = false
let updatedAt = 0

function clear(heights: Float32Array, fromX: number, fromY: number, feet: number) {
  for (let k = 0; k <= reach; k++) {
    const [x, y] = [Math.round(fromX + stepX * k), Math.round(fromY + stepY * k)]
    if (y < 0 || y >= mapHeight) break
    const spread = k ? 1 : 0
    for (let side = Math.max(0, x - spread); side <= Math.min(mapWidth - 1, x + spread); side++) {
      const i = y * mapWidth + side
      heights[i] = Math.min(heights[i]!, feet + rise * k)
    }
  }
}

function sightlineCeilings(): DataTexture {
  const heights = new Float32Array(mapWidth * mapHeight).fill(open)
  for (const place of places) {
    for (const spot of spots(place)) {
      clear(heights, spot.x, spot.y, surfaceAt(spot.x + 0.5, spot.y + 0.5))
    }
  }
  fixed = heights.slice()
  const texture = new DataTexture(heights, mapWidth, mapHeight, RedFormat, FloatType)
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.needsUpdate = true
  return texture
}

export function revealWalkers(walkers: Float32Array, count: number) {
  const shown = reveal.value > 0 ? count : 0
  const now = performance.now()
  if (!ceilings || !fixed || (shown === 0 && !walking) || now - updatedAt < everyMs) return
  const heights = ceilings.image.data as Float32Array
  heights.set(fixed)
  for (let n = 0; n < shown; n++) {
    clear(
      heights,
      Math.floor(walkers[n * 3]!),
      Math.floor(walkers[n * 3 + 1]!),
      walkers[n * 3 + 2]!,
    )
  }
  walking = shown > 0
  updatedAt = now
  ceilings.needsUpdate = true
}

export function seeThrough(
  material: Material,
  also?: (shader: WebGLProgramParametersWithUniforms) => void,
  spared = 0,
) {
  material.allowOverride = false
  const facing = material instanceof MeshBasicMaterial ? 'vec3(0.0, 0.0, 1.0)' : 'normal'
  const program = `sightline-${programs++}`
  material.customProgramCacheKey = () => program
  material.onBeforeCompile = (shader) => {
    cutAway(shader, facing, spared)
    also?.(shader)
  }
}

function cutAway(shader: WebGLProgramParametersWithUniforms, facing: string, spared: number) {
  shader.uniforms.sightlines = { value: (ceilings ??= sightlineCeilings()) }
  shader.uniforms.reveal = reveal
  shader.uniforms.drawingNormals = drawingNormals
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
varying vec3 vSightline;`,
    )
    .replace(
      '#include <project_vertex>',
      `#include <project_vertex>
vec4 sightline = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
sightline = instanceMatrix * sightline;
#endif
vSightline = (modelMatrix * sightline).xyz;`,
    )
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
uniform sampler2D sightlines;
uniform float reveal;
uniform bool drawingNormals;
varying vec3 vSightline;
float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }`,
    )
    .replace(
      '#include <opaque_fragment>',
      `if (reveal > 0.0) {
  float ceiling = texture2D(sightlines, vSightline.xz / vec2(${mapWidth}.0, ${mapHeight}.0)).r;
  float dither = bayer2(0.5 * gl_FragCoord.xy) * 0.25 + bayer2(gl_FragCoord.xy);
  if (vSightline.y > ceiling + ${spared.toFixed(2)} && dither < reveal) discard;
}
#include <opaque_fragment>`,
    )
    .replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
if (drawingNormals) gl_FragColor = vec4(${facing} * 0.5 + 0.5, 1.0);`,
    )
}
