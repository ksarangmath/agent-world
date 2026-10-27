import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import { Color, Matrix4, Object3D, Vector3, type InstancedMesh, type Material } from 'three'
import { onScreen } from '../clock'
import { creatureKits } from './kits'
import { glowMaterial, litMaterial, mistMaterial } from './materials'
import type { Spot } from './scatter'

type Kit = keyof typeof creatureKits
type Pose = {
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  roll: number
  sx: number
  sy: number
  sz: number
}
type Animate = (spot: Spot, seconds: number, pose: Pose) => boolean

const hidden = new Matrix4().makeScale(0, 0, 0)
const dummy = new Object3D()
const pose: Pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, sx: 1, sy: 1, sz: 1 }
const up = new Vector3(0, 1, 0)
const toward = new Vector3()

type HerdProps = { kit: Kit; spots: Spot[]; animate: Animate; material: Material; tints?: string[] }

function Herd({ kit, spots, animate, material, tints }: HerdProps) {
  const mesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const herd = mesh.current!
    if (tints) {
      const color = new Color()
      spots.forEach((_, i) => herd.setColorAt(i, color.set(tints[i % tints.length]!)))
      herd.instanceColor!.needsUpdate = true
    }
    if (material !== mistMaterial) return
    herd.onBeforeRender = (_renderer, scene) =>
      herd.geometry.setDrawRange(0, scene.overrideMaterial ? 0 : Infinity)
  }, [material, spots, tints])
  useFrame(() => {
    const herd = mesh.current!
    const seconds = Date.now() / 1000
    spots.forEach((spot, i) => {
      ;[pose.x, pose.y, pose.z, pose.yaw, pose.pitch, pose.roll] = [
        spot.x,
        spot.base,
        spot.y,
        0,
        0,
        0,
      ]
      pose.sx = pose.sy = pose.sz = 1
      if (!onScreen(spot.x, spot.y) || !animate(spot, seconds, pose)) {
        herd.setMatrixAt(i, hidden)
        return
      }
      dummy.position.set(pose.x, pose.y, pose.z)
      dummy.rotation.set(pose.pitch, pose.yaw, pose.roll, 'YXZ')
      dummy.scale.set(pose.sx, pose.sy, pose.sz)
      dummy.updateMatrix()
      herd.setMatrixAt(i, dummy.matrix)
    })
    herd.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh
      ref={mesh}
      args={[creatureKits[kit], material, Math.max(1, spots.length)]}
      count={spots.length}
      frustumCulled={false}
    />
  )
}

const flicker: Animate = (spot, t, out) => {
  out.sy = 1 + 0.3 * Math.sin(t * 9 + spot.phase) + 0.15 * Math.sin(t * 14 + spot.phase * 2)
  out.sx = out.sz = 1 + 0.1 * Math.sin(t * 7 + spot.phase)
  out.yaw = t * 2 + spot.phase
  return true
}

const lounge: Animate = (spot, t, out) => {
  out.y = spot.base + 0.04 * Math.sin(t * 1.3 + spot.phase)
  out.yaw = spot.phase + 0.3 * Math.sin(t * 0.4 + spot.phase)
  out.pitch = 0.12 * Math.sin(t * 0.9 + spot.phase)
  return true
}

const kite = new Vector3()
const kiteAt = (spot: Spot, t: number) =>
  kite.set(
    spot.x + 1.4 * Math.sin(t * 0.37 + spot.phase),
    spot.base + 5 + 0.6 * Math.sin(t * 0.71 + spot.phase),
    spot.y - 2 + 0.8 * Math.cos(t * 0.29 + spot.phase),
  )

const fly: Animate = (spot, t, out) => {
  const { x, y, z } = kiteAt(spot, t)
  ;[out.x, out.y, out.z] = [x, y, z]
  out.roll = 0.35 * Math.sin(t * 1.1 + spot.phase)
  out.yaw = 0.4
  return true
}

const whaleCycle = 26
const swim = (spot: Spot, t: number, out: Pose) => {
  const angle = t * 0.035 + spot.phase
  out.x = spot.x + 5 * Math.cos(angle)
  out.z = spot.y + 5 * Math.sin(angle)
  out.yaw = angle + Math.PI
  return (t + spot.phase * 9) % whaleCycle
}

const breach: Animate = (spot, t, out) => {
  const phase = swim(spot, t, out)
  if (phase > 13) return false
  const dive = Math.max(0, (phase - 9) / 4)
  out.y = 0.25 + 0.06 * Math.sin(t) - dive * 1.8
  out.pitch = dive * 0.5
  out.sx = out.sy = out.sz = 1
  return true
}

const blow: Animate = (spot, t, out) => {
  const phase = swim(spot, t, out)
  if (phase > 2.5) return false
  const puff = Math.sin((phase / 2.5) * Math.PI)
  out.y = 0.5
  out.sx = out.sz = 0.6 + puff * 0.6
  out.sy = puff * 1.4
  return true
}

const leap: Animate = (spot, t, out) => {
  const cycle = (t + spot.phase) % 4
  if (cycle > 1.3) return false
  const progress = cycle / 1.3
  const heading = Math.floor((t + spot.phase) / 4) * 1.3 + spot.phase
  out.x = spot.x + Math.sin(heading) * (progress - 0.5) * 2.2
  out.z = spot.y + Math.cos(heading) * (progress - 0.5) * 2.2
  out.y = 1.1 * Math.sin(progress * Math.PI) - 0.15
  out.yaw = heading
  out.pitch = (progress - 0.5) * 1.6
  return true
}

const drift: Animate = (spot, t, out) => {
  out.x = spot.x + 0.8 * Math.sin(t * 0.05 + spot.phase)
  out.sx = out.sz = 2.4 + 0.4 * Math.sin(t * 0.2 + spot.phase)
  out.sy = 1.2
  return true
}

function Strings({ kites }: { kites: Spot[] }) {
  const mesh = useRef<InstancedMesh>(null)
  useFrame(() => {
    const strings = mesh.current!
    const t = Date.now() / 1000
    kites.forEach((spot, i) => {
      if (!onScreen(spot.x, spot.y)) {
        strings.setMatrixAt(i, hidden)
        return
      }
      const [ax, ay, az] = [spot.x, spot.base + 0.6, spot.y + 1]
      toward.copy(kiteAt(spot, t)).sub(dummy.position.set(ax, ay, az))
      const length = toward.length()
      dummy.quaternion.setFromUnitVectors(up, toward.normalize())
      dummy.scale.set(1, length, 1)
      dummy.updateMatrix()
      strings.setMatrixAt(i, dummy.matrix)
    })
    strings.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh
      ref={mesh}
      args={[creatureKits.string, litMaterial, Math.max(1, kites.length)]}
      count={kites.length}
      frustumCulled={false}
    />
  )
}

const kiteColors = ['#ff006e', '#ffbe0b', '#3a86ff', '#06d6a0', '#fb5607', '#8338ec']

type Props = {
  flames: Spot[]
  seaLions: Spot[]
  kites: Spot[]
  whales: Spot[]
  dolphins: Spot[]
  mist: Spot[]
}

export function Creatures({ flames, seaLions, kites, whales, dolphins, mist }: Props) {
  return (
    <>
      <Herd kit="flame" spots={flames} animate={flicker} material={glowMaterial} />
      <Herd kit="seaLion" spots={seaLions} animate={lounge} material={litMaterial} />
      <Herd kit="kite" spots={kites} animate={fly} material={litMaterial} tints={kiteColors} />
      <Strings kites={kites} />
      <Herd kit="whale" spots={whales} animate={breach} material={litMaterial} />
      <Herd kit="spout" spots={whales} animate={blow} material={glowMaterial} />
      <Herd kit="dolphin" spots={dolphins} animate={leap} material={litMaterial} />
      <Herd kit="mist" spots={mist} animate={drift} material={mistMaterial} />
    </>
  )
}
