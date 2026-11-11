import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { BoxGeometry, Color, MeshBasicMaterial, Object3D, type InstancedMesh } from 'three'
import { places, type Place } from '../../shared/map/places'
import { spots } from '../../shared/map/spots'
import { useDetail, viewFrom } from './clock'
import { surfaceAt } from './decks'
import { hash } from './elevation'
import { toon } from './paint'
import { seeThrough } from './sightlines'

type Move = 'spin' | 'sway' | 'bob' | 'bounce' | 'flicker' | 'beat' | 'disco'
type Prop = {
  x: number
  z: number
  y: number
  size: [number, number, number]
  color: string
  yaw: number
  move?: Move
}

const box = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0)
const material = toon()
const glowing = new MeshBasicMaterial()
const underfoot = 0.35
seeThrough(material, undefined, underfoot)
seeThrough(glowing, undefined, underfoot)
const propScale = 1.7
const bright = ['#e8524a', '#f2b632', '#4aa3df', '#5fbf6b', '#b06ad9', '#f28c38']
const across = Math.hypot(viewFrom.x, viewFrom.z)
const awayFromCamera = [-viewFrom.x / across, -viewFrom.z / across] as const

export function propsOf(place: Place): Prop[] {
  const props: Prop[] = []
  spots(place).forEach((spot, i) => {
    const [cx, cz] = [spot.x + 0.5, spot.y + 0.5]
    const [dx, dz] = [place.center.x - spot.x, place.center.y - spot.y]
    const length = Math.sqrt(dx * dx + dz * dz)
    const [ux, uz] =
      place.activity === 'climbing'
        ? awayFromCamera
        : length > 0.5
          ? [dx / length, dz / length]
          : [0, 1]
    const yaw = Math.atan2(ux, uz)
    const ground = surfaceAt(cx, cz)
    const seed = hash(spot.x * 3, spot.y * 7)
    const color = bright[Math.floor(seed * bright.length)]!
    const add = (
      forward: number,
      lift: number,
      size: [number, number, number],
      tint: string,
      side = 0,
      move?: Move,
    ) =>
      props.push({
        x: cx + (ux * forward + uz * side) * propScale,
        z: cz + (uz * forward - ux * side) * propScale,
        y: ground + lift * propScale,
        size: [size[0] * propScale, size[1] * propScale, size[2] * propScale],
        color: tint,
        yaw,
        move,
      })
    const floor = (tint: string, top: number, move?: Move) =>
      props.push({
        x: cx,
        z: cz,
        y: ground,
        size: [1, top, 1],
        color: tint,
        yaw: 0,
        move,
      })
    const stool = () => add(0, 0, [0.16, 0.12, 0.16], '#7a5a3a')
    const table = (top: string) => {
      add(0.26, 0, [0.05, 0.22, 0.05], '#5b4632')
      add(0.26, 0.22, [0.32, 0.04, 0.32], top)
    }
    switch (place.activity) {
      case 'coding':
        stool()
        table('#d8d2c4')
        add(0.26, 0.26, [0.15, 0.01, 0.1], '#2a2e35')
        add(0.31, 0.26, [0.15, 0.1, 0.012], '#8ccaf0')
        break
      case 'coffee':
      case 'eating':
        stool()
        table('#efe6d6')
        add(0.26, 0.26, [0.05, 0.06, 0.05], place.activity === 'coffee' ? '#f4f1ea' : '#e0a24a')
        break
      case 'reading':
        stool()
        table('#c9a978')
        add(0.26, 0.26, [0.12, 0.03, 0.09], color)
        break
      case 'chess':
        stool()
        table('#e8e2d4')
        add(0.26, 0.26, [0.2, 0.015, 0.2], i % 2 ? '#2b2b2b' : '#f2f2f2')
        break
      case 'picnic':
        add(0, 0, [0.62, 0.02, 0.62], i % 2 ? '#d9534f' : '#4a7fc1')
        add(0.18, 0.02, [0.12, 0.09, 0.09], '#b5895a', 0.18)
        break
      case 'music':
        add(0, 0, [1, 0.1, 1], '#a8744a')
        add(0.46, 0.1, [0.9, 0.03, 0.05], color)
        if (i === 0) {
          add(0.6, 0.1, [0.25, 0.55, 0.25], '#2a2a33', 0.5, 'beat')
          add(0.6, 0.1, [0.25, 0.55, 0.25], '#2a2a33', -0.5, 'beat')
        }
        break
      case 'pitching':
        add(0, 0, [1, 0.14, 1], '#4a6aa0')
        if (i === 0) add(0.8, 0.14, [1.4, 0.8, 0.06], '#8fd0ff')
        break
      case 'art':
        add(0.3, 0, [0.04, 0.5, 0.04], '#8a6a46')
        add(0.3, 0.22, [0.34, 0.27, 0.03], color)
        break
      case 'climbing':
        add(0.45, 0, [0.95, 1.3, 0.12], '#8a9aa8')
        for (let hold = 0; hold < 4; hold++) {
          add(
            0.38,
            0.2 + hold * 0.28,
            [0.08, 0.08, 0.05],
            bright[(i + hold) % bright.length]!,
            hold % 2 ? 0.2 : -0.2,
          )
        }
        break
      case 'running':
        add(0.4, 0, [0.1, 0.14, 0.1], '#f28c38')
        break
      case 'hiking':
        if (i === 0) {
          add(0.4, 0, [0.06, 0.6, 0.06], '#7a5a3a')
          add(0.4, 0.42, [0.42, 0.16, 0.04], '#a0784e')
        }
        break
      case 'surfing':
        add(0.2, 0, [0.12, 0.75, 0.035], color, 0.3, 'bob')
        break
      case 'sailing':
        add(0, -0.02, [1, 0.08, 1], '#a88a6a')
        add(0.45, 0, [0.07, 0.3, 0.07], '#6b4f36', 0.45)
        break
      case 'tinkering':
        add(0.3, 0, [0.55, 0.26, 0.28], '#8b5a2b')
        add(0.3, 0.26, [0.13, 0.13, 0.13], '#9aa3ad')
        add(0.3, 0.39, [0.08, 0.07, 0.08], '#c7cdd3', 0, 'sway')
        break
      case 'chatting':
        add(0.3, 0, [0.45, 0.12, 0.16], '#7a5a3a')
        break
      case 'comedy':
      case 'karaoke':
        if (i === 0) {
          add(0, 0, [1.2, 0.12, 1.2], '#7a3b3b')
          add(0.3, 0.12, [0.03, 0.5, 0.03], '#2a2a33')
          add(0.3, 0.62, [0.07, 0.07, 0.07], '#c7cdd3')
          add(
            -0.7,
            0.12,
            [1.3, place.activity === 'karaoke' ? 0.6 : 0.95, 0.08],
            place.activity === 'karaoke' ? '#ff5fa8' : '#9a4b3c',
            0,
            place.activity === 'karaoke' ? 'disco' : undefined,
          )
        } else {
          stool()
          add(0.24, 0, [0.04, 0.2, 0.04], '#5b4632')
          add(0.24, 0.2, [0.18, 0.03, 0.18], '#2f2a36')
          add(0.24, 0.23, [0.05, 0.07, 0.05], color)
        }
        break
      case 'games':
        stool()
        table('#e3d5b8')
        add(0.26, 0.26, [0.22, 0.015, 0.22], '#3f8f5a')
        add(0.22, 0.275, [0.04, 0.05, 0.04], color, 0.05)
        add(0.3, 0.275, [0.04, 0.04, 0.04], bright[(i + 2) % bright.length]!, -0.05)
        add(0.26, 0.275, [0.03, 0.03, 0.03], '#f4f1ea')
        break
      case 'rallying':
        floor((spot.x + spot.y) % 2 ? '#3f7fbf' : '#3f9f6f', 0.03)
        add(0.3, 0.06, [0.6, 0.18, 0.02], '#f4f1ea')
        add(0.1, 0.06, [0.05, 0.05, 0.05], '#d8f23a', 0.25, 'bounce')
        break
      case 'swimming':
        floor((spot.x + spot.y) % 2 ? '#49b6e8' : '#5cc3ee', 0.3)
        break
      case 'skating':
        floor((spot.x + spot.y) % 2 ? '#c79a5e' : '#d4a96b', 0.04)
        if (i === 0) {
          add(0, 1.5, [0.02, 0.5, 0.02], '#8e969e')
          add(0, 1.25, [0.25, 0.25, 0.25], '#e8eef5', 0, 'spin')
        }
        break
      case 'dogs':
        add(
          0.35,
          0,
          [0.12, 0.12, 0.26],
          i % 3 === 0 ? '#3a2f28' : i % 3 === 1 ? '#c98a4b' : '#f1e6d2',
          0.2,
          'bob',
        )
        add(
          0.5,
          0.08,
          [0.1, 0.1, 0.1],
          i % 3 === 0 ? '#3a2f28' : i % 3 === 1 ? '#c98a4b' : '#f1e6d2',
          0.2,
          'bob',
        )
        if (i % 4 === 0) add(0.2, 0, [0.07, 0.07, 0.07], '#d8f23a', -0.3, 'bounce')
        break
      case 'flying':
        add(0, 0, [0.5, 0.02, 0.5], color)
        if (i === 0) {
          add(0.9, 0, [0.03, 0.9, 0.03], '#8e969e', 0.9)
          add(0.9, 0.8, [0.1, 0.1, 0.34], '#f28c38', 0.9, 'sway')
        }
        break
      case 'camping':
        add(0, 0, [0.3, 0.1, 0.14], '#7a5a3a')
        add(0.3, 0, [0.08, 0.3, 0.08], '#5b4632', 0.2)
        add(0.3, 0.3, [0.07, 0.07, 0.07], '#f4f1ea', 0.2)
        if (i === 0) {
          add(0.75, 0, [0.34, 0.06, 0.08], '#5b4632')
          add(0.75, 0, [0.08, 0.06, 0.34], '#6b4f36')
          add(0.75, 0.06, [0.14, 0.24, 0.14], '#ff7a2f', 0, 'flicker')
          add(0.75, 0.06, [0.08, 0.34, 0.08], '#ffb347', 0.05, 'flicker')
          add(0.75, 0.06, [0.07, 0.18, 0.07], '#ffd166', -0.06, 'flicker')
        }
        break
      case 'yoga':
        floor('#c9a978', 0.05)
        add(0, 0.06, [0.38, 0.015, 0.56], color)
        break
      case 'dancing':
        floor((spot.x + spot.y) % 2 ? '#b8834f' : '#a8744a', 0.04, 'disco')
        if (i === 0) {
          add(0.7, 0.05, [0.3, 0.6, 0.3], '#2a2a33', 0.6, 'beat')
          add(0.7, 0.05, [0.3, 0.6, 0.3], '#2a2a33', -0.6, 'beat')
        }
        break
      case 'gardening':
        add(0.36, 0, [0.7, 0.14, 0.4], '#8b5a2b')
        add(0.36, 0.14, [0.6, 0.03, 0.3], '#4a3524')
        add(0.36, 0.17, [0.1, 0.16, 0.1], '#4f9f4a', -0.2, 'sway')
        add(0.36, 0.17, [0.1, 0.22, 0.1], '#5fbf6b', 0, 'sway')
        add(0.36, 0.17, [0.1, 0.12, 0.1], i % 2 ? '#e8524a' : '#f2b632', 0.2, 'sway')
        break
      case 'cooking':
        add(0.32, 0, [0.6, 0.3, 0.3], '#c7cdd3')
        add(0.32, 0.3, [0.16, 0.1, 0.16], '#2f2a36', -0.14)
        add(0.32, 0.3, [0.18, 0.02, 0.12], '#e3d5b8', 0.16)
        add(0.32, 0.32, [0.05, 0.04, 0.05], i % 2 ? '#e8524a' : '#5fbf6b', 0.16)
        add(0.32, 0.44, [0.07, 0.07, 0.07], '#f4f1ea', -0.14, 'bob')
        break
      case 'fishing':
        add(0.55, 0.42, [0.015, 0.015, 0.9], '#5b4632')
        add(0.98, 0, [0.008, 0.42, 0.008], '#e8eef5')
        add(0.98, -0.02, [0.05, 0.05, 0.05], '#e8524a', 0, 'bob')
        add(0.1, 0, [0.14, 0.14, 0.14], '#4aa3df', 0.28)
        break
      case 'stargazing':
        add(0.3, 0, [0.03, 0.32, 0.03], '#2a2a33')
        add(0.3, 0.32, [0.09, 0.09, 0.4], '#e8eef5', 0, 'sway')
        add(0, 0, [0.4, 0.02, 0.8], '#5a4a7a')
        break
      case 'pottery':
        stool()
        add(0.3, 0, [0.3, 0.16, 0.3], '#6b6f7a')
        add(0.3, 0.16, [0.22, 0.03, 0.22], '#9aa3ad', 0, 'spin')
        add(0.3, 0.19, [0.1, 0.12, 0.1], '#c0643f', 0, 'spin')
        break
      case 'birding':
        add(0.5, 0, [0.03, 0.5, 0.03], '#7f9a4a', 0.3)
        add(0.56, 0, [0.03, 0.62, 0.03], '#8fae5a', 0.18)
        add(0.48, 0, [0.03, 0.42, 0.03], '#6f8a3a', -0.26)
        if (i % 3 === 0) {
          add(0.26, 0, [0.02, 0.3, 0.02], '#2a2a33')
          add(0.26, 0.3, [0.06, 0.06, 0.22], '#3a4a3a')
        }
        break
    }
  })
  const taken = spots(place).map((spot) => [spot.x + 0.5, spot.y + 0.5] as const)
  return props.filter(({ x, z, size: [width, height, depth], yaw }) => {
    if (height < 0.5 || Math.min(width, depth) < 0.3) return true
    const [cos, sin] = [Math.cos(yaw), Math.sin(yaw)]
    return !taken.some(([sx, sz]) => {
      const [across, along] = [(sx - x) * cos - (sz - z) * sin, (sx - x) * sin + (sz - z) * cos]
      return Math.abs(across) < width / 2 + 0.15 && Math.abs(along) < depth / 2 + 0.15
    })
  })
}

const disco = bright.map((hex) => new Color(hex))
const flames = ['#ff7a2f', '#ffb347', '#ffd166'].map((hex) => new Color(hex))

const dummy = new Object3D()
const paint = new Color()

function place(mesh: InstancedMesh, list: Prop[], seconds?: number) {
  list.forEach((prop, i) => {
    const phase = (prop.x * 12.9898 + prop.z * 78.233) % (Math.PI * 2)
    const t = (seconds ?? 0) + phase
    const [width, height, depth] = prop.size
    const move = seconds === undefined ? undefined : prop.move
    const lift =
      move === 'bob'
        ? 0.05 * Math.sin(t * 2.4)
        : move === 'bounce'
          ? 0.45 * Math.abs(Math.sin(t * 3.2))
          : 0
    const turn = move === 'spin' ? t * 3 : move === 'sway' ? 0.45 * Math.sin(t * 1.1) : 0
    const beat = move === 'beat' ? 1 + 0.07 * Math.max(0, Math.sin(t * 9)) : 1
    const flame =
      move === 'flicker' ? 0.75 + 0.35 * Math.abs(Math.sin(t * 7.3) * Math.sin(t * 3.1)) : 1
    dummy.position.set(prop.x, prop.y + lift, prop.z)
    dummy.rotation.set(0, prop.yaw + turn, 0)
    dummy.scale.set(width * beat, height * beat * flame, depth * beat)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
    if (move === 'disco') mesh.setColorAt(i, disco[Math.floor(t * 1.5) % disco.length]!)
    else if (move === 'flicker') mesh.setColorAt(i, flames[Math.floor(t * 6) % flames.length]!)
    else if (seconds === undefined) mesh.setColorAt(i, paint.set(prop.color))
  })
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}

const lit = (prop: Prop) => prop.move === 'disco' || prop.move === 'flicker'

export function Places() {
  const still = useRef<InstancedMesh>(null)
  const moving = useRef<InstancedMesh>(null)
  const glow = useRef<InstancedMesh>(null)
  const props = useMemo(() => {
    const all = places.flatMap(propsOf)
    return {
      still: all.filter((prop) => !prop.move),
      moving: all.filter((prop) => prop.move && !lit(prop)),
      glow: all.filter(lit),
    }
  }, [])
  const detail = useDetail()
  useLayoutEffect(() => {
    place(still.current!, props.still)
    place(moving.current!, props.moving)
    place(glow.current!, props.glow)
    for (const mesh of [still, moving, glow]) mesh.current!.computeBoundingSphere()
  }, [props])
  useFrame(() => {
    if (!detail) return
    place(moving.current!, props.moving, Date.now() / 1000)
    place(glow.current!, props.glow, Date.now() / 1000)
  })
  return (
    <>
      <instancedMesh
        ref={still}
        args={[box, material, props.still.length]}
        castShadow={detail}
        receiveShadow
      />
      <instancedMesh
        ref={moving}
        args={[box, material, props.moving.length]}
        castShadow={detail}
        receiveShadow
      />
      <instancedMesh ref={glow} args={[box, glowing, props.glow.length]} />
    </>
  )
}
