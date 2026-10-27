import { useFrame } from '@react-three/fiber'
import { useRef, type RefObject } from 'react'
import type { Group } from 'three'
import type { Avatar } from '../../shared/profile'

export const partKeys = [
  'leftLeg',
  'rightLeg',
  'leftShoe',
  'rightShoe',
  'skirt',
  'torso',
  'head',
  'hair',
  'facialHair',
  'glasses',
  'bubble',
] as const
export type PartKey = (typeof partKeys)[number]

type Vector = [number, number, number]
export type Part = {
  size: Vector
  offset: Vector
  color: string
  limb?: { pivot: Vector; side: 1 | -1 }
}

const hairHeight: Record<Avatar['hair_style'], number> = {
  short: 0.12,
  medium: 0.2,
  long: 0.36,
  curly: 0.2,
  ponytail: 0.16,
  bun: 0.16,
  buzzed: 0.05,
  bald: 0,
}

export function humanoidParts(avatar: Avatar, talking: boolean): Partial<Record<PartKey, Part>> {
  const legColor = avatar.bottom_style === 'shorts' ? avatar.skin_tone : avatar.bottom_color
  const hip = (x: number): Vector => [x, 0.42, 0]
  const hair = hairHeight[avatar.hair_style]
  return {
    leftLeg: {
      size: [0.16, 0.4, 0.18],
      offset: [0, -0.2, 0],
      color: legColor,
      limb: { pivot: hip(-0.1), side: 1 },
    },
    rightLeg: {
      size: [0.16, 0.4, 0.18],
      offset: [0, -0.2, 0],
      color: legColor,
      limb: { pivot: hip(0.1), side: -1 },
    },
    leftShoe: {
      size: [0.17, 0.06, 0.24],
      offset: [0, -0.4, 0.03],
      color: avatar.shoe_color,
      limb: { pivot: hip(-0.1), side: 1 },
    },
    rightShoe: {
      size: [0.17, 0.06, 0.24],
      offset: [0, -0.4, 0.03],
      color: avatar.shoe_color,
      limb: { pivot: hip(0.1), side: -1 },
    },
    ...(avatar.bottom_style === 'skirt' && {
      skirt: { size: [0.4, 0.16, 0.26], offset: [0, 0.38, 0], color: avatar.bottom_color },
    }),
    torso: { size: [0.42, 0.44, 0.24], offset: [0, 0.66, 0], color: avatar.top_color },
    head: { size: [0.3, 0.3, 0.28], offset: [0, 1.04, 0], color: avatar.skin_tone },
    ...(hair > 0 && {
      hair: {
        size: [0.32, 0.08 + hair, 0.3],
        offset: [0, 1.24 - hair / 2, -0.02 - hair * 0.15],
        color: avatar.hair_color,
      },
    }),
    ...(avatar.facial_hair !== 'none' && {
      facialHair: {
        size: [0.22, avatar.facial_hair === 'beard' ? 0.14 : 0.05, 0.02],
        offset: [0, avatar.facial_hair === 'mustache' ? 1.0 : 0.95, 0.145],
        color: avatar.hair_color,
      },
    }),
    ...(avatar.glasses !== 'none' && {
      glasses: {
        size: [0.26, 0.06, 0.02],
        offset: [0, 1.07, 0.145],
        color: avatar.glasses === 'sunglasses' ? '#111111' : '#d8d8d8',
      },
    }),
    ...(talking && {
      bubble: { size: [0.3, 0.2, 0.05], offset: [0.28, 1.45, 0], color: '#ffffff' },
    }),
  }
}

export const strideRate = 10
export const strideAngle = 0.6

export function Humanoid({ avatar, walking }: { avatar: Avatar; walking: RefObject<boolean> }) {
  const limbs = useRef<Record<string, Group | null>>({})
  useFrame(({ clock }) => {
    const swing = walking.current ? Math.sin(clock.elapsedTime * strideRate) * strideAngle : 0
    for (const [key, group] of Object.entries(limbs.current)) {
      const side = key.startsWith('left') ? 1 : -1
      group?.rotation.set(swing * side, 0, 0)
    }
  })
  return (
    <group scale={0.9}>
      {Object.entries(humanoidParts(avatar, false)).map(([key, part]) => {
        const box = (
          <mesh position={part.offset}>
            <boxGeometry args={part.size} />
            <meshLambertMaterial color={part.color} />
          </mesh>
        )
        return part.limb ? (
          <group
            key={key}
            position={part.limb.pivot}
            ref={(group) => {
              limbs.current[key] = group
            }}
          >
            {box}
          </group>
        ) : (
          <group key={key}>{box}</group>
        )
      })}
    </group>
  )
}
