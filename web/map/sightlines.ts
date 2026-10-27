import {
  DataTexture,
  FloatType,
  NearestFilter,
  RedFormat,
  type WebGLProgramParametersWithUniforms,
} from 'three'
import { mapHeight, mapWidth } from '../../shared/map/grid'
import { places } from '../../shared/map/places'
import { spots } from '../../shared/map/spots'
import { viewFrom } from './clock'
import { surfaceAt } from './elevation'

const reach = 14
const open = 1e4
const clearest = 0.5
const reveal = { value: 0 }
let ceilings: DataTexture | undefined

export function revealAt(zoom: number) {
  reveal.value = clearest * Math.min(1, Math.max(0, (zoom - 12) / 12))
}

function sightlineCeilings(): DataTexture {
  const across = Math.hypot(viewFrom.x, viewFrom.z)
  const [stepX, stepY, rise] = [viewFrom.x / across, viewFrom.z / across, viewFrom.y / across]
  const heights = new Float32Array(mapWidth * mapHeight).fill(open)
  for (const place of places) {
    for (const spot of spots(place)) {
      const feet = surfaceAt(spot.x + 0.5, spot.y + 0.5)
      for (let k = 0; k <= reach; k++) {
        const [x, y] = [Math.round(spot.x + stepX * k), Math.round(spot.y + stepY * k)]
        if (y >= mapHeight) break
        const spread = k ? 1 : 0
        for (
          let side = Math.max(0, x - spread);
          side <= Math.min(mapWidth - 1, x + spread);
          side++
        ) {
          const i = y * mapWidth + side
          heights[i] = Math.min(heights[i]!, feet + rise * k)
        }
      }
    }
  }
  const texture = new DataTexture(heights, mapWidth, mapHeight, RedFormat, FloatType)
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.needsUpdate = true
  return texture
}

export function seeThrough(shader: WebGLProgramParametersWithUniforms) {
  shader.uniforms.sightlines = { value: (ceilings ??= sightlineCeilings()) }
  shader.uniforms.reveal = reveal
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
varying vec3 vSightline;
float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }`,
    )
    .replace(
      '#include <opaque_fragment>',
      `if (reveal > 0.0) {
  float ceiling = texture2D(sightlines, vSightline.xz / vec2(${mapWidth}.0, ${mapHeight}.0)).r;
  float dither = bayer2(0.5 * gl_FragCoord.xy) * 0.25 + bayer2(gl_FragCoord.xy);
  if (vSightline.y > ceiling && dither < reveal) discard;
}
#include <opaque_fragment>`,
    )
}
