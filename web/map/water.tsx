import { useEffect, useMemo } from 'react'
import { DataTexture, LinearFilter, RedFormat, ShaderMaterial } from 'three'
import { mapHeight, mapWidth } from '../../shared/map/grid'
import { sky } from './clock'
import { shoreDistance } from './elevation'

const vertexShader = `
varying vec2 vTile;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vTile = world.xz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const fragmentShader = `
uniform sampler2D shore;
uniform float time;
uniform float daylight;
uniform float golden;
uniform vec2 size;
varying vec2 vTile;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 linear(vec3 c) { return pow(c, vec3(2.2)); }
float offshore(vec2 tile) {
  vec2 uv = tile / size;
  bool outside = uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0;
  return outside ? 31.0 : texture2D(shore, uv).r * 255.0;
}
void main() {
  float tiles = (
    offshore(vTile) * 2.0 +
    offshore(vTile + vec2(1.5, 0.0)) + offshore(vTile - vec2(1.5, 0.0)) +
    offshore(vTile + vec2(0.0, 1.5)) + offshore(vTile - vec2(0.0, 1.5))
  ) / 6.0;
  float swell = sin(vTile.x * 0.21 + time * 0.5) * sin(vTile.y * 0.17 - time * 0.35);
  float depth = clamp((tiles + swell * 0.7) / 7.0, 0.0, 1.0);
  vec3 color = linear(vec3(0.55, 0.92, 0.86));
  color = mix(color, linear(vec3(0.25, 0.74, 0.88)), step(0.16, depth));
  color = mix(color, linear(vec3(0.14, 0.55, 0.86)), step(0.42, depth));
  color = mix(color, linear(vec3(0.09, 0.41, 0.8)), step(0.78, depth));

  float broken = step(0.35, hash(floor(vTile * 0.7) + floor(time * 0.2)));
  float roller = step(0.84, fract(tiles * 0.5 + time * 0.2)) * broken;
  float surf = roller * (1.0 - smoothstep(1.0, 4.0, tiles)) + (1.0 - smoothstep(0.5, 1.1, tiles));

  vec2 lane = vec2(vTile.x * 0.45 + time * 0.12, vTile.y * 2.6);
  vec2 cell = floor(lane);
  vec2 within = fract(lane);
  float seed = hash(cell);
  float alive = smoothstep(0.55, 0.95, sin(time * (0.5 + seed) + seed * 40.0));
  float dash = step(0.93, hash(cell + 7.0)) * alive;
  dash *= smoothstep(0.0, 0.2, within.x) * (1.0 - smoothstep(0.8, 1.0, within.x));
  dash *= step(0.3, within.y) * step(within.y, 0.62) * step(2.0, tiles);

  vec3 glint = mix(vec3(1.0), vec3(1.0, 0.78, 0.5), golden);
  color = mix(color, color * vec3(1.2, 0.92, 0.86), golden * 0.7);
  color = mix(color, linear(vec3(0.5, 0.74, 0.92)) * glint, dash * 0.75);
  color = mix(color, linear(vec3(0.95, 0.98, 1.0)) * glint, clamp(surf, 0.0, 1.0) * 0.75);
  vec3 night = linear(vec3(0.05, 0.09, 0.22));
  gl_FragColor = vec4(mix(night + color * 0.18, color, daylight), 1.0);
}
`

export function Water() {
  const material = useMemo(() => {
    const texture = new DataTexture(shoreDistance, mapWidth, mapHeight, RedFormat)
    texture.magFilter = LinearFilter
    texture.minFilter = LinearFilter
    texture.needsUpdate = true
    return new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        shore: { value: texture },
        size: { value: [mapWidth, mapHeight] },
        time: sky.time,
        daylight: sky.daylight,
        golden: sky.golden,
      },
    })
  }, [])
  useEffect(() => () => (material.uniforms.shore!.value.dispose(), material.dispose()), [material])
  return (
    <mesh rotation-x={-Math.PI / 2} position={[mapWidth / 2, 0, mapHeight / 2]} material={material}>
      <planeGeometry args={[mapWidth * 8, mapHeight * 8]} />
    </mesh>
  )
}
