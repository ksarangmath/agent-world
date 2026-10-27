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
uniform vec2 size;
varying vec2 vTile;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 linear(vec3 c) { return pow(c, vec3(2.2)); }
void main() {
  vec2 uv = vTile / size;
  bool outside = uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0;
  float tiles = outside ? 31.0 : texture2D(shore, uv).r * 255.0;
  float depth = clamp(tiles / 7.0, 0.0, 1.0);
  vec3 color = linear(vec3(0.5, 0.86, 0.82));
  color = mix(color, linear(vec3(0.24, 0.66, 0.8)), step(0.2, depth));
  color = mix(color, linear(vec3(0.15, 0.45, 0.72)), step(0.55, depth));
  vec2 cell = floor(vTile * 2.0);
  float sparkle = step(0.992, hash(cell + floor(time * 1.2)));
  vec2 dash = floor(vec2(vTile.x * 0.5 + time * 0.3, vTile.y * 1.5));
  float wave = step(0.99, hash(dash + floor(time * 0.25 + hash(dash) * 4.0))) * step(2.0, tiles);
  float foam = step(tiles, 1.5) * (0.55 + 0.45 * sin(time * 1.7 + vTile.x * 0.7 + vTile.y * 0.4));
  color = mix(color, linear(vec3(0.94, 0.97, 1.0)), clamp(sparkle * 0.5 + foam * 0.6, 0.0, 1.0));
  color = mix(color, linear(vec3(0.42, 0.66, 0.86)), wave * 0.6);
  vec3 night = linear(vec3(0.05, 0.09, 0.2));
  gl_FragColor = vec4(mix(night + color * 0.15, color, daylight), 1.0);
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
