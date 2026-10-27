import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { DataTexture, FloatType, LinearFilter, RedFormat, ShaderMaterial, type Mesh } from 'three'
import { groundKinds, mapHeight, mapWidth, warp } from '../../shared/map/grid'
import { ground, isDry } from '../../shared/map/terrain'
import { sky } from './clock'

const altitude = 5
const [, goldenGate] = warp(-122.478, 37.815)
const clearAtZoom = 30
const coastRows = 12
const animated = { time: { value: 0 }, thickness: { value: 1 }, clear: { value: 1 } }

const pacific = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
})

function thickness(date: Date) {
  const parts = pacific.formatToParts(date)
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const hour = part('hour') + part('minute') / 60
  if (hour < 9) return 1
  if (hour < 12) return 1 - (0.85 * (hour - 9)) / 3
  if (hour < 16) return 0.15
  if (hour < 19) return 0.15 + (0.85 * (hour - 16)) / 3
  return 1
}

function westCoast(): Float32Array {
  const firstLand = new Float32Array(mapHeight).fill(Infinity)
  for (let y = 0; y < mapHeight; y++) {
    for (let x = 0; x < mapWidth; x++) {
      if (isDry(groundKinds[ground[y * mapWidth + x]!]!)) {
        firstLand[y] = x
        break
      }
    }
  }
  return firstLand.map((_, y) => {
    const nearby = firstLand.subarray(Math.max(0, y - coastRows), y + coastRows + 1)
    const coast = Math.min(...nearby)
    return Number.isFinite(coast) ? coast : -mapWidth
  })
}

const vertexShader = `
varying vec2 vTile;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vTile = world.xz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const fragmentShader = `
uniform sampler2D coast;
uniform float height;
uniform float gateRow;
uniform float time;
uniform float thickness;
uniform float clear;
uniform float daylight;
varying vec2 vTile;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float sum = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amplitude * noise(p);
    p *= 2.03;
    amplitude *= 0.5;
  }
  return sum;
}
void main() {
  float shore = texture2D(coast, vec2(0.5, clamp(vTile.y / height, 0.0, 1.0))).r;
  float gate = exp(-pow((vTile.y - gateRow) / 18.0, 2.0));
  float front = shore + thickness * (45.0 + 115.0 * gate);
  float reach = smoothstep(front, front - 28.0, vTile.x) * smoothstep(shore - 90.0, shore - 40.0, vTile.x);
  float n = fbm((vTile - vec2(time * 0.4, time * 0.08)) * 0.07);
  float density = smoothstep(0.5 - 0.15 * thickness, 0.75 - 0.1 * thickness, n) * reach * smoothstep(0.25, 0.6, thickness);
  density = floor(density * 4.0 + 0.5) / 4.0;
  vec3 color = mix(vec3(0.16, 0.18, 0.24), vec3(0.96, 0.97, 0.98), daylight);
  gl_FragColor = vec4(color, density * 0.82 * clear);
}
`

export function Fog() {
  const mesh = useRef<Mesh>(null)
  const material = useMemo(() => {
    const texture = new DataTexture(westCoast(), 1, mapHeight, RedFormat, FloatType)
    texture.magFilter = LinearFilter
    texture.minFilter = LinearFilter
    texture.needsUpdate = true
    return new ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      uniforms: {
        coast: { value: texture },
        height: { value: mapHeight },
        gateRow: { value: goldenGate },
        ...animated,
        daylight: sky.daylight,
      },
    })
  }, [])
  useEffect(() => () => (material.uniforms.coast!.value.dispose(), material.dispose()), [material])
  useLayoutEffect(() => {
    const fog = mesh.current!
    fog.onBeforeRender = (_renderer, scene) =>
      fog.geometry.setDrawRange(0, scene.overrideMaterial ? 0 : Infinity)
  }, [])
  const checked = useRef(0)
  useFrame(({ camera }) => {
    const now = Date.now()
    animated.time.value = (now / 1000) % 100000
    if (now - checked.current > 5000) {
      animated.thickness.value = thickness(new Date(now))
      checked.current = now
    }
    animated.clear.value = Math.min(1, Math.max(0.1, (clearAtZoom - camera.zoom) / 22))
  })
  return (
    <mesh
      ref={mesh}
      rotation-x={-Math.PI / 2}
      position={[mapWidth / 2 - 80, altitude, mapHeight / 2]}
      material={material}
      renderOrder={1}
    >
      <planeGeometry args={[mapWidth + 160, mapHeight]} />
    </mesh>
  )
}
