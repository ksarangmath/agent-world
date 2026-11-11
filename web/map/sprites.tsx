import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  CanvasTexture,
  InstancedBufferAttribute,
  type InstancedMesh,
  NearestFilter,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  type Texture,
} from 'three'
import type { Avatar } from '../../shared/profile'
import { sky } from './clock'
import {
  baseRamp,
  eyeBaseOf,
  layersOf,
  materialOf,
  paletteRows,
  paletteTexture,
  sheetsWithout,
  type Layer,
} from './lpc'

export type Facing = 0 | 1 | 2 | 3
export type Motion =
  'walk' | 'idle' | 'sit' | 'talk' | 'perform' | 'work' | 'swing' | 'hop' | 'climb'
export type Placement = {
  x: number
  y: number
  ground: number
  facing: Facing
  motion: Motion
  seconds: number
}

const size = 1.4
const columns = 9
const rows = 20
const frame = 64
const walkFrames = 8
const swingFrames = 6
const hopFrames = 5
const climbFrames = 6
const hopCell = (step: number, facing: number): [number, number] =>
  step < 3 ? [6 + step, 4 + facing] : [4 + step, 8 + facing]
const climbCell = (step: number): [number, number] => [6 + (step % 3), 16 + Math.floor(step / 3)]
export const body = {
  width: (size * 30) / frame,
  height: (size * 56) / frame,
  reach: (size * 17) / frame,
}
const placeholder = new Vector3()
const retries = 4

const sheets = new Map<string, Promise<Texture>>()

async function image(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} failed with ${response.status}`)
  return createImageBitmap(await response.blob())
}

function texture(canvas: HTMLCanvasElement) {
  const result = new CanvasTexture(canvas)
  result.magFilter = NearestFilter
  result.minFilter = NearestFilter
  result.generateMipmaps = false
  return result
}

function loadSheet(sheet: string) {
  let loading = sheets.get(sheet)
  if (!loading) {
    const frames = (name: 'jump' | 'climb') =>
      sheetsWithout[name].has(sheet) ? null : image(`/lpc/${sheet}${name}.png`)
    loading = Promise.all([
      ...['walk', 'idle', 'sit', 'emote', 'spellcast', 'thrust', 'slash'].map((name) =>
        image(`/lpc/${sheet}${name}.png`),
      ),
      frames('jump'),
      frames('climb'),
    ]).then(([walk, idle, sit, emote, spellcast, thrust, slash, jump, climb]) => {
      const canvas = document.createElement('canvas')
      canvas.width = columns * frame
      canvas.height = rows * frame
      const context = canvas.getContext('2d')!
      const copy = (from: ImageBitmap, column: number, row: number, to: [number, number]) =>
        context.drawImage(
          from,
          column * frame,
          row * frame,
          frame,
          frame,
          to[0] * frame,
          to[1] * frame,
          frame,
          frame,
        )
      context.drawImage(walk!, 0, 0)
      context.drawImage(idle!, 0, 4 * frame)
      context.drawImage(sit!, 2 * frame, 4 * frame)
      context.drawImage(emote!, 3 * frame, 4 * frame)
      context.drawImage(spellcast!, 0, 8 * frame)
      context.drawImage(thrust!, 0, 12 * frame)
      context.drawImage(slash!, 0, 16 * frame)
      for (let step = 0; step < hopFrames; step++) {
        for (let facing = 0; facing < 4; facing++) {
          if (jump) copy(jump, step, facing, hopCell(step, facing))
        }
      }
      for (let step = 0; step < climbFrames; step++) {
        if (climb) copy(climb, step, 0, climbCell(step))
      }
      return texture(canvas)
    })
    sheets.set(
      sheet,
      loading.catch((error: unknown) => {
        sheets.delete(sheet)
        throw error
      }),
    )
  }
  return sheets.get(sheet)!
}

const quad = new PlaneGeometry(1, 1).translate(0, 0.5, 0)

const vertexShader = `
attribute vec3 offset;
attribute vec2 cell;
attribute vec2 ramps;
uniform float bias;
varying vec2 vUv;
varying vec2 vRamps;
void main() {
  vec4 view = viewMatrix * vec4(offset, 1.0);
  view.xy += position.xy * ${size.toFixed(2)};
  view.z += bias;
  gl_Position = projectionMatrix * view;
  vUv = vec2((cell.x + uv.x) / ${columns}.0, (${rows}.0 - cell.y - 1.0 + uv.y) / ${rows}.0);
  vRamps = ramps;
}
`

const fragmentShader = `
uniform sampler2D map;
uniform sampler2D palette;
uniform vec3 base[6];
uniform vec3 eyeBase[3];
uniform int baseCount;
uniform float daylight;
uniform bool face;
uniform bool lens;
varying vec2 vUv;
varying vec2 vRamps;
bool same(vec3 a, vec3 b) { return all(lessThan(abs(a - b), vec3(0.006))); }
vec3 ramp(float row, int index) {
  return texture2D(palette, vec2((float(index) + 0.5) / 6.0, (row + 0.5) / ${paletteRows}.0)).rgb;
}
vec3 linear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
void main() {
  vec4 texel = texture2D(map, vUv);
  if (texel.a < 0.5) discard;
  if (lens && all(greaterThan(texel.rgb, vec3(0.78)))) discard;
  vec3 color = texel.rgb;
  bool eyeWhite = face && (same(texel.rgb, vec3(0.949, 0.969, 0.973)) || same(texel.rgb, eyeBase[2]));
  if (vRamps.x >= 0.0) {
    for (int i = 0; i < 6; i++) if (i < baseCount && same(texel.rgb, base[i])) color = ramp(vRamps.x, i);
  }
  if (eyeWhite) {
    color = ramp(vRamps.x, 4);
  } else if (vRamps.y >= 0.0) {
    for (int i = 0; i < 3; i++) if (same(texel.rgb, eyeBase[i])) color = ramp(vRamps.y, i);
  }
  color = linear(color) * mix(vec3(0.66, 0.7, 0.95), vec3(1.0), daylight);
  gl_FragColor = vec4(color, 1.0);
}
`

function material(sheet: string, map: Texture, z: number) {
  const kind = materialOf(sheet)
  const flat = (ramp: readonly (readonly number[])[]) =>
    ramp.map(([r, g, b]) => new Vector3(r, g, b))
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      map: { value: map },
      palette: { value: paletteTexture },
      base: { value: kind ? flat(baseRamp(kind)) : Array.from({ length: 6 }, () => placeholder) },
      eyeBase: { value: flat(eyeBaseOf(sheet)) },
      baseCount: { value: kind ? 6 : 0 },
      bias: { value: z * 0.0005 },
      face: { value: sheet.includes('/heads/') },
      lens: { value: sheet.includes('glasses') },
      daylight: sky.daylight,
    },
  })
}

type Entry = { person: number; ramp: number; eyes: number; hops: boolean }
type Group = { sheet: string; z: number; entries: Entry[] }

function SheetMesh({
  group,
  placements,
}: {
  group: Group
  placements: { current: (Placement | null)[] }
}) {
  const [map, setMap] = useState<Texture | null>(null)
  useEffect(() => {
    let alive = true
    let attempt = 0
    const load = () =>
      loadSheet(group.sheet)
        .then((loaded) => alive && setMap(loaded))
        .catch(() => {
          attempt += 1
          if (alive && attempt < retries) setTimeout(load, 1000 * 2 ** attempt)
        })
    void load()
    return () => {
      alive = false
    }
  }, [group.sheet])
  const capacity = Math.max(1, group.entries.length)
  const geometry = useMemo(() => {
    const instanced = quad.clone()
    instanced.setAttribute(
      'offset',
      new InstancedBufferAttribute(new Float32Array(capacity * 3), 3),
    )
    instanced.setAttribute('cell', new InstancedBufferAttribute(new Float32Array(capacity * 2), 2))
    instanced.setAttribute('ramps', new InstancedBufferAttribute(new Float32Array(capacity * 2), 2))
    return instanced
  }, [capacity])
  const shader = useMemo(
    () => map && material(group.sheet, map, group.z),
    [map, group.sheet, group.z],
  )
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => shader?.dispose(), [shader])
  const mesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const instanced = mesh.current
    if (!instanced) return
    instanced.onBeforeRender = (_renderer, scene) =>
      instanced.geometry.setDrawRange(0, scene.overrideMaterial ? 0 : Infinity)
  }, [shader])
  useFrame(() => {
    const instanced = mesh.current
    if (!instanced) return
    const offset = geometry.getAttribute('offset') as InstancedBufferAttribute
    const cell = geometry.getAttribute('cell') as InstancedBufferAttribute
    const ramps = geometry.getAttribute('ramps') as InstancedBufferAttribute
    let count = 0
    for (const entry of group.entries) {
      const place = placements.current[entry.person]
      if (!place) continue
      offset.setXYZ(count, place.x, place.ground, place.y)
      const [column, row] = cellOf(place, entry.hops)
      cell.setXY(count, column, row)
      ramps.setXY(count, entry.ramp, entry.eyes)
      count++
    }
    instanced.count = count
    offset.needsUpdate = true
    cell.needsUpdate = true
    ramps.needsUpdate = true
  })
  return shader ? (
    <instancedMesh ref={mesh} args={[geometry, shader, capacity]} frustumCulled={false} />
  ) : null
}

function cellOf({ facing, motion, seconds }: Placement, hops: boolean): [number, number] {
  switch (hops || motion !== 'hop' ? motion : 'perform') {
    case 'walk':
      return [1 + (Math.floor(seconds * 10) % walkFrames), facing]
    case 'swing':
      return [Math.floor(seconds * 9) % swingFrames, 16 + facing]
    case 'hop':
      return hopCell(Math.floor(seconds * 8) % hopFrames, facing)
    case 'climb':
      return climbCell(Math.floor(seconds * 5) % climbFrames)
    case 'sit':
      return [2, 4 + facing]
    case 'talk':
      return [3 + (Math.floor(seconds * 5) % 3), 4 + facing]
    case 'perform':
      return [Math.floor(seconds * 10) % 7, 8 + facing]
    case 'work':
      return [Math.floor(seconds * 10) % 8, 12 + facing]
    default:
      return [Math.floor(seconds * 1.5) % 2, 4 + facing]
  }
}

export function Sprites({
  avatars,
  placements,
}: {
  avatars: Avatar[]
  placements: { current: (Placement | null)[] }
}) {
  const groups = useMemo(() => {
    const bySheet = new Map<string, Group>()
    const add = (layer: Layer, person: number, hops: boolean) => {
      const group = bySheet.get(layer.sheet) ?? { sheet: layer.sheet, z: layer.z, entries: [] }
      group.entries.push({ person, ramp: layer.ramp, eyes: layer.eyes, hops })
      bySheet.set(layer.sheet, group)
    }
    avatars.forEach((avatar, person) => {
      const layers = layersOf(avatar)
      const hops = layers.every((layer) => !sheetsWithout.jump.has(layer.sheet))
      for (const layer of layers) add(layer, person, hops)
    })
    return [...bySheet.values()]
  }, [avatars])
  return groups.map((group) => (
    <SheetMesh
      key={`${group.sheet}#${group.entries.length}`}
      group={group}
      placements={placements}
    />
  ))
}
