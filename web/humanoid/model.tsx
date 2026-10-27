import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'
import type { Activity } from '../../shared/map/places'
import type { Avatar } from '../../shared/profile'

export const partKeys = [
  'leftLeg',
  'rightLeg',
  'leftShoe',
  'rightShoe',
  'skirt',
  'torso',
  'leftArm',
  'rightArm',
  'head',
  'hair',
  'facialHair',
  'glasses',
  'bubble',
  'dots',
  'vehicle',
] as const
export type PartKey = (typeof partKeys)[number]

type Vector = [number, number, number]
export type Limb = { pivot: Vector; side: 0 | 1; kind: 'leg' | 'arm' }
export type Part = { size: Vector; offset: Vector; color: string; limb?: Limb }

export type Pose = {
  lift: number
  roll: number
  legs: [number, number]
  arms: [number, number]
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

const hip = (x: number): Vector => [x, 0.42, 0]
const shoulder = (x: number): Vector => [x, 0.84, 0]

export type Extras = { talking: boolean; vehicle?: string }

export function humanoidParts(avatar: Avatar, extras: Extras): Partial<Record<PartKey, Part>> {
  const legColor = avatar.bottom_style === 'shorts' ? avatar.skin_tone : avatar.bottom_color
  const hair = hairHeight[avatar.hair_style]
  const leg = (side: 0 | 1): Part => ({
    size: [0.16, 0.4, 0.18],
    offset: [0, -0.2, 0],
    color: legColor,
    limb: { pivot: hip(side ? 0.1 : -0.1), side, kind: 'leg' },
  })
  const shoe = (side: 0 | 1): Part => ({
    size: [0.17, 0.06, 0.24],
    offset: [0, -0.4, 0.03],
    color: avatar.shoe_color,
    limb: { pivot: hip(side ? 0.1 : -0.1), side, kind: 'leg' },
  })
  const arm = (side: 0 | 1): Part => ({
    size: [0.11, 0.4, 0.13],
    offset: [0, -0.18, 0],
    color: avatar.top_color,
    limb: { pivot: shoulder(side ? 0.27 : -0.27), side, kind: 'arm' },
  })
  return {
    leftLeg: leg(0),
    rightLeg: leg(1),
    leftShoe: shoe(0),
    rightShoe: shoe(1),
    ...(avatar.bottom_style === 'skirt' && {
      skirt: { size: [0.4, 0.16, 0.26], offset: [0, 0.38, 0], color: avatar.bottom_color },
    }),
    torso: { size: [0.42, 0.44, 0.24], offset: [0, 0.66, 0], color: avatar.top_color },
    leftArm: arm(0),
    rightArm: arm(1),
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
    ...(extras.talking && {
      bubble: { size: [0.42, 0.28, 0.06], offset: [0.36, 1.62, 0], color: '#ffffff' },
      dots: { size: [0.26, 0.06, 0.02], offset: [0.36, 1.62, 0.04], color: '#3a3f4b' },
    }),
    ...(extras.vehicle && {
      vehicle: { size: [1.3, 0.5, 2.2], offset: [0, -0.1, 0], color: extras.vehicle },
    }),
  }
}

const standing: Pose = { lift: 0, roll: 0, legs: [0, 0], arms: [0, 0] }
const seated = (arms: [number, number]): Pose => ({
  lift: -0.14,
  roll: 0,
  legs: [-1.45, -1.45],
  arms,
})

export const strideRate = 10

export function walkingPose(t: number, rate = strideRate): Pose {
  const swing = Math.sin(t * rate)
  return {
    lift: Math.abs(swing) * 0.04,
    roll: 0,
    legs: [swing * 0.6, -swing * 0.6],
    arms: [-swing * 0.5, swing * 0.5],
  }
}

export function talkingPose(t: number): Pose {
  return {
    lift: Math.abs(Math.sin(t * 1.3)) * 0.02,
    roll: 0,
    legs: [0, 0],
    arms: [
      -0.2 - 0.25 * Math.max(0, Math.sin(t * 2.1)),
      -0.5 - 0.4 * Math.max(0, Math.sin(t * 2.7 + 1)),
    ],
  }
}

export function activityPose(activity: Activity, t: number): Pose {
  const wave = (rate: number, phase = 0) => Math.sin(t * rate + phase)
  switch (activity) {
    case 'coding':
      return seated([-1.2 + 0.08 * wave(17), -1.2 + 0.08 * wave(19, 1)])
    case 'coffee':
    case 'eating':
      return seated([-1.0, -0.7 - 1.3 * Math.max(0, wave(0.9)) ** 6])
    case 'reading':
      return seated([-1.15, -1.15 + 0.05 * wave(0.4)])
    case 'chess':
      return seated([-0.9, -0.9 - 0.4 * Math.max(0, wave(0.6)) ** 8])
    case 'picnic':
      return {
        lift: -0.36,
        roll: 0,
        legs: [-1.5, -1.5],
        arms: [-0.3, -0.3 - 0.6 * Math.max(0, wave(0.7)) ** 4],
      }
    case 'music':
      return {
        lift: Math.abs(wave(4)) * 0.05,
        roll: 0.05 * wave(2),
        legs: [0, 0],
        arms: [-1.1, -0.9 + 0.35 * wave(9)],
      }
    case 'art':
      return { ...standing, arms: [-0.3, -1.4 + 0.35 * wave(3)] }
    case 'climbing': {
      const climb = 0.5 + 0.5 * wave(0.45)
      return {
        lift: climb * 1.2,
        roll: 0,
        legs: [0.4 * wave(2), -0.4 * wave(2)],
        arms: [-2.8 + 0.3 * wave(2), -2.8 - 0.3 * wave(2)],
      }
    }
    case 'running':
      return walkingPose(t, 14)
    case 'hiking':
      return walkingPose(t, 7)
    case 'surfing':
    case 'sailing':
      return {
        lift: 0.03 * wave(1.5),
        roll: 0.15 * wave(1.2),
        legs: [0.2, -0.2],
        arms: [-0.2, -0.2],
      }
    case 'tinkering':
      return {
        lift: -0.06,
        roll: 0,
        legs: [-0.3, -0.3],
        arms: [-1.0, -1.2 + 0.45 * Math.abs(wave(6))],
      }
    case 'pitching':
      return {
        ...standing,
        arms: [-0.3 - 0.6 * Math.max(0, wave(1.6)), -0.8 - 0.5 * Math.max(0, wave(2.3, 2))],
      }
    case 'chatting':
      return talkingPose(t)
  }
}

export function Humanoid({ avatar, walking }: { avatar: Avatar; walking: { current: boolean } }) {
  const limbs = useRef<Record<string, Group | null>>({})
  const parts = humanoidParts(avatar, { talking: false })
  useFrame(({ clock }) => {
    const pose = walking.current ? walkingPose(clock.elapsedTime) : standing
    for (const [key, group] of Object.entries(limbs.current)) {
      const limb = parts[key as PartKey]?.limb
      if (group && limb)
        group.rotation.set((limb.kind === 'leg' ? pose.legs : pose.arms)[limb.side], 0, 0)
    }
  })
  return (
    <group scale={0.9}>
      {Object.entries(parts).map(([key, part]) => {
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
