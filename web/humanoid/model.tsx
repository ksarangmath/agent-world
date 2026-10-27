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
  'belt',
  'collar',
  'hood',
  'leftArm',
  'rightArm',
  'leftHand',
  'rightHand',
  'head',
  'leftEye',
  'rightEye',
  'leftBrow',
  'rightBrow',
  'mouth',
  'hair',
  'hairBack',
  'hairExtra',
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

const hipHeight = 0.3
const shoulderHeight = 0.64
const headCenter = 0.86
const face = 0.205

const hip = (side: 0 | 1): Vector => [side ? 0.09 : -0.09, hipHeight, 0]
const shoulder = (side: 0 | 1): Vector => [side ? 0.25 : -0.25, shoulderHeight, 0]

const hairCaps: Record<Avatar['hair_style'], { height: number; width: number } | null> = {
  short: { height: 0.1, width: 0.46 },
  medium: { height: 0.14, width: 0.48 },
  long: { height: 0.14, width: 0.48 },
  curly: { height: 0.2, width: 0.54 },
  ponytail: { height: 0.12, width: 0.46 },
  bun: { height: 0.1, width: 0.46 },
  buzzed: { height: 0.04, width: 0.45 },
  bald: null,
}

export type Extras = { talking: boolean; vehicle?: string }

export function humanoidParts(avatar: Avatar, extras: Extras): Partial<Record<PartKey, Part>> {
  const legColor = avatar.bottom_style === 'shorts' ? avatar.skin_tone : avatar.bottom_color
  const cap = hairCaps[avatar.hair_style]
  const style = avatar.top_style
  const leg = (side: 0 | 1): Part => ({
    size: [0.15, 0.3, 0.16],
    offset: [0, -0.15, 0],
    color: legColor,
    limb: { pivot: hip(side), side, kind: 'leg' },
  })
  const shoe = (side: 0 | 1): Part => ({
    size: [0.16, 0.07, 0.23],
    offset: [0, -0.29, 0.03],
    color: avatar.shoe_color,
    limb: { pivot: hip(side), side, kind: 'leg' },
  })
  const arm = (side: 0 | 1): Part => ({
    size: [0.1, 0.28, 0.12],
    offset: [0, -0.13, 0],
    color: avatar.top_color,
    limb: { pivot: shoulder(side), side, kind: 'arm' },
  })
  const hand = (side: 0 | 1): Part => ({
    size: [0.1, 0.08, 0.11],
    offset: [0, -0.31, 0],
    color: avatar.skin_tone,
    limb: { pivot: shoulder(side), side, kind: 'arm' },
  })
  const eye = (x: number): Part => ({
    size: [0.07, 0.1, 0.02],
    offset: [x, headCenter + 0.01, face],
    color: '#1b1b22',
  })
  const brow = (x: number): Part => ({
    size: [0.09, 0.025, 0.02],
    offset: [x, headCenter + 0.1, face],
    color: avatar.hair_color,
  })
  return {
    leftLeg: leg(0),
    rightLeg: leg(1),
    leftShoe: shoe(0),
    rightShoe: shoe(1),
    ...(avatar.bottom_style === 'skirt' && {
      skirt: { size: [0.38, 0.16, 0.26], offset: [0, hipHeight, 0], color: avatar.bottom_color },
    }),
    torso: { size: [0.4, 0.36, 0.24], offset: [0, 0.48, 0], color: avatar.top_color },
    belt: { size: [0.41, 0.05, 0.25], offset: [0, 0.32, 0], color: '#2b2622' },
    ...((style === 'blazer' || style === 'jacket' || style === 'shirt') && {
      collar: {
        size: [0.12, 0.3, 0.02],
        offset: [0, 0.5, 0.125],
        color: style === 'shirt' ? '#f4f1ea' : '#e9e4da',
      },
    }),
    ...(style === 'hoodie' && {
      hood: { size: [0.34, 0.12, 0.1], offset: [0, 0.66, -0.12], color: avatar.top_color },
    }),
    leftArm: arm(0),
    rightArm: arm(1),
    leftHand: hand(0),
    rightHand: hand(1),
    head: { size: [0.44, 0.4, 0.4], offset: [0, headCenter, 0], color: avatar.skin_tone },
    leftEye: eye(-0.09),
    rightEye: eye(0.09),
    leftBrow: brow(-0.09),
    rightBrow: brow(0.09),
    mouth: { size: [0.09, 0.025, 0.02], offset: [0, headCenter - 0.1, face], color: '#9c4a4a' },
    ...(cap && {
      hair: {
        size: [cap.width, cap.height, 0.44],
        offset: [0, headCenter + 0.2 + cap.height / 2 - 0.03, -0.01],
        color: avatar.hair_color,
      },
    }),
    ...((avatar.hair_style === 'long' || avatar.hair_style === 'curly') && {
      hairBack: {
        size: [0.48, avatar.hair_style === 'long' ? 0.44 : 0.3, 0.1],
        offset: [0, avatar.hair_style === 'long' ? 0.82 : 0.9, -0.22],
        color: avatar.hair_color,
      },
    }),
    ...(avatar.hair_style === 'ponytail' && {
      hairExtra: { size: [0.12, 0.26, 0.1], offset: [0, 0.86, -0.26], color: avatar.hair_color },
    }),
    ...(avatar.hair_style === 'bun' && {
      hairExtra: { size: [0.18, 0.14, 0.18], offset: [0, 1.2, -0.08], color: avatar.hair_color },
    }),
    ...(avatar.facial_hair !== 'none' && {
      facialHair: {
        size:
          avatar.facial_hair === 'mustache'
            ? [0.18, 0.04, 0.02]
            : [0.32, avatar.facial_hair === 'beard' ? 0.13 : 0.07, 0.03],
        offset: [0, avatar.facial_hair === 'mustache' ? 0.79 : 0.72, face + 0.005],
        color: avatar.hair_color,
      },
    }),
    ...(avatar.glasses !== 'none' && {
      glasses: {
        size: [0.34, 0.07, 0.02],
        offset: [0, headCenter + 0.025, face + 0.01],
        color: avatar.glasses === 'sunglasses' ? '#111111' : '#d8d8d8',
      },
    }),
    ...(extras.talking && {
      bubble: { size: [0.5, 0.32, 0.06], offset: [0.42, 1.45, 0], color: '#ffffff' },
      dots: { size: [0.3, 0.07, 0.02], offset: [0.42, 1.45, 0.04], color: '#3a3f4b' },
    }),
    ...(extras.vehicle && {
      vehicle: { size: [1.3, 0.45, 2], offset: [0, -0.1, 0], color: extras.vehicle },
    }),
  }
}

const standing: Pose = { lift: 0, roll: 0, legs: [0, 0], arms: [0, 0] }
const seated = (arms: [number, number]): Pose => ({
  lift: -0.04,
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
        lift: -0.27,
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
        lift: climb * 0.9,
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
