import {
  Color,
  DataTexture,
  DoubleSide,
  FrontSide,
  Matrix4,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  RedFormat,
  type Material,
  type Side,
  type WebGLProgramParametersWithUniforms,
} from 'three'
import type { Activity } from '../../shared/map/places'
import type { Avatar } from '../../shared/profile'
import { hasHair, hasTrim, skeletons } from './shapes'

export const segments = [
  'body',
  'leftUpperArm',
  'leftForearm',
  'rightUpperArm',
  'rightForearm',
  'leftThigh',
  'leftShin',
  'rightThigh',
  'rightShin',
  'dots',
  'vehicle',
] as const
type Segment = (typeof segments)[number]

export type FigurePart = { shape: string; color: string; segment: number }
export type Figure = { build: Avatar['build']; near: FigurePart[]; far: FigurePart[] }
export type Extras = { talking: boolean; vehicle?: string }

export type Pose = {
  lift: number
  roll: number
  legs: [number, number]
  knees: [number, number]
  arms: [number, number]
  elbows: [number, number]
  riding?: boolean
}

const eyeColors: Record<Avatar['eye_color'], string> = {
  'dark-brown': '#2f1e15',
  brown: '#5b3a22',
  hazel: '#7a5c2c',
  green: '#4c7a4b',
  blue: '#4a7db6',
  gray: '#7d8a96',
}

const mix = (from: string, to: string, amount: number) =>
  `#${new Color(from).lerp(new Color(to), amount).getHexString()}`

export function figure(avatar: Avatar, extras: Extras): Figure {
  const { build, face_shape: face, top_style: top, bottom_style: bottom } = avatar
  const hair = avatar.hair_color
  const skin = avatar.skin_tone
  const near: FigurePart[] = []
  const far: FigurePart[] = []
  const part = (shape: string, color: string, segment: Segment = 'body') => ({
    shape,
    color,
    segment: segments.indexOf(segment),
  })
  const add = (shape: string, color: string, segment?: Segment) =>
    near.push(part(shape, color, segment))

  add(`head:${face}`, skin)
  add(`neck:${build}`, skin)
  add(`nose:${face}:${avatar.nose}`, skin)
  add(`eyes:${face}:${avatar.eye_shape}:whites`, '#f6f1ea')
  add(`eyes:${face}:${avatar.eye_shape}:irises`, eyeColors[avatar.eye_color])
  add(`eyes:${face}:${avatar.eye_shape}:darks`, '#1d1512')
  add(`eyes:${face}:${avatar.eye_shape}:glints`, '#ffffff')
  add(`brows:${face}:${avatar.brows}`, mix(hair, '#000000', 0.35))
  add(`cheeks:${face}`, mix(skin, '#e86f78', 0.28))
  add(`lips:${face}:${avatar.lips}`, mix(mix(skin, '#c4545c', 0.38), '#000000', 0.08))
  if (hasHair(avatar.hair_style)) {
    add(
      `hair:${face}:${avatar.hair_style}`,
      avatar.hair_style === 'buzzed' ? mix(hair, skin, 0.35) : hair,
    )
  }
  if (avatar.facial_hair !== 'none') {
    add(
      `facial:${face}:${avatar.facial_hair}`,
      avatar.facial_hair === 'stubble' ? mix(skin, hair, 0.5) : hair,
    )
  }
  if (avatar.glasses !== 'none') {
    add(
      `glasses:${face}:${avatar.glasses}`,
      avatar.glasses === 'sunglasses' ? '#15151a' : '#2c2830',
    )
  }
  add(`torso:${build}`, avatar.top_color)
  if (hasTrim(top, 'trim')) {
    add(
      `top:${top}:trim:${build}`,
      mix(avatar.top_color, top === 'shirt' ? '#ffffff' : '#000000', 0.22),
    )
  }
  if (hasTrim(top, 'inner')) add(`top:${top}:inner:${build}`, '#f4f1ea')
  add(`hips:${build}`, avatar.bottom_color)
  if (bottom === 'skirt') add(`skirt:${build}`, avatar.bottom_color)
  for (const side of ['left', 'right'] as const) {
    add(`limb:upperArm:${build}`, avatar.top_color, `${side}UpperArm`)
    add(`limb:forearm:${build}`, top === 't-shirt' ? skin : avatar.top_color, `${side}Forearm`)
    add('hand', skin, `${side}Forearm`)
    add(`limb:thigh:${build}`, bottom === 'skirt' ? skin : avatar.bottom_color, `${side}Thigh`)
    add(`limb:shin:${build}`, bottom === 'pants' ? avatar.bottom_color : skin, `${side}Shin`)
    add('shoe', avatar.shoe_color, `${side}Shin`)
  }
  far.push(
    part('blob:head', skin),
    part('blob:torso', avatar.top_color),
    part('blob:legs', avatar.bottom_color),
  )
  if (hasHair(avatar.hair_style)) far.push(part('blob:hair', hair))
  const shared = [
    ...(extras.talking ? [part('bubble', '#ffffff'), part('dots', '#3a3f4b', 'dots')] : []),
    ...(extras.vehicle ? [part('vehicle', extras.vehicle, 'vehicle')] : []),
  ]
  return { build, near: [...near, ...shared], far: [...far, ...shared] }
}

const figureBands = (() => {
  const texture = new DataTexture(new Uint8Array([150, 178, 205, 228, 245, 255]), 6, 1, RedFormat)
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.needsUpdate = true
  return texture
})()

const rimLight = (shader: WebGLProgramParametersWithUniforms) => {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <opaque_fragment>',
    `vec3 rimView = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition);
float rim = pow(1.0 - clamp(dot(normal, rimView), 0.0, 1.0), 3.0);
outgoingLight += rim * 0.28 * (0.35 + 0.65 * diffuseColor.rgb);
#include <opaque_fragment>`,
  )
}

const strands = (shader: WebGLProgramParametersWithUniforms) => {
  rimLight(shader)
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vStrand;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStrand = position;')
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vStrand;')
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
vec3 fromCrown = vStrand - vec3(0.0, 1.06, 0.0);
float around = atan(fromCrown.x, fromCrown.z);
float strand = sin(around * 46.0 + fromCrown.y * 18.0) * 0.5 + 0.5;
float sheen = smoothstep(0.035, 0.0, abs(length(fromCrown.xz) - 0.075 - fromCrown.y * 0.4)) * step(0.02, fromCrown.y);
diffuseColor.rgb *= 0.86 + 0.18 * strand;
diffuseColor.rgb = mix(diffuseColor.rgb, min(vec3(1.0), diffuseColor.rgb * 1.6 + 0.08), sheen * 0.7);`,
    )
}

const figureMaterial = (side: Side = FrontSide, patch = rimLight) => {
  const material = new MeshToonMaterial({ gradientMap: figureBands, side })
  material.onBeforeCompile = patch
  return material
}

const solid = figureMaterial()
const fabric = figureMaterial(DoubleSide)
const tresses = figureMaterial(DoubleSide, strands)
const glint = new MeshBasicMaterial()

export function materialFor(shape: string): Material {
  if (shape.endsWith(':glints')) return glint
  if (shape.startsWith('hair:')) return tresses
  if (shape.startsWith('skirt:')) return fabric
  return solid
}

export const castsShadow = (shape: string) =>
  /^(head|neck|hair|torso|hips|skirt|limb|hand|shoe|vehicle|blob)/.test(shape)

const shoulderTilt = 0.05
const [offset, swing, hidden] = [new Matrix4(), new Matrix4(), new Matrix4().makeScale(0, 0, 0)]
const [upper, lower] = [new Matrix4(), new Matrix4()]

export function articulate(
  body: Matrix4,
  build: Avatar['build'],
  pose: Pose,
  seconds: number,
  out: Float32Array,
  at: number,
) {
  const bones = skeletons[build]
  body.toArray(out, at)
  for (const side of [0, 1] as const) {
    const sign = side ? 1 : -1
    upper
      .copy(body)
      .multiply(offset.makeTranslation(sign * bones.shoulder.x, bones.shoulder.y, 0))
      .multiply(swing.makeRotationZ(sign * shoulderTilt))
      .multiply(swing.makeRotationX(pose.arms[side]))
      .toArray(out, at + 16 * (1 + 2 * side))
    lower
      .copy(upper)
      .multiply(offset.makeTranslation(0, bones.elbow, 0))
      .multiply(swing.makeRotationX(pose.elbows[side]))
      .toArray(out, at + 16 * (2 + 2 * side))
    upper
      .copy(body)
      .multiply(offset.makeTranslation(sign * bones.hip.x, bones.hip.y, 0))
      .multiply(swing.makeRotationX(pose.legs[side]))
      .toArray(out, at + 16 * (5 + 2 * side))
    lower
      .copy(upper)
      .multiply(offset.makeTranslation(0, bones.knee, 0))
      .multiply(swing.makeRotationX(pose.knees[side]))
      .toArray(out, at + 16 * (6 + 2 * side))
  }
  upper
    .copy(body)
    .multiply(offset.makeTranslation(0, 0.012 * Math.sin(seconds * 6), 0))
    .toArray(out, at + 16 * 9)
  ;(pose.riding ? body : hidden).toArray(out, at + 16 * 10)
}

const standing: Pose = {
  lift: 0,
  roll: 0,
  legs: [0, 0],
  knees: [0, 0],
  arms: [0.04, 0.04],
  elbows: [-0.15, -0.15],
}

export const riding: Pose = { ...standing, riding: true }

const seated = (arms: [number, number], elbows: [number, number]): Pose => ({
  lift: -0.27,
  roll: 0,
  legs: [-1.5, -1.5],
  knees: [1.5, 1.5],
  arms,
  elbows,
})

export const strideRate = 10

export function walkingPose(t: number, rate = strideRate, reach = 1): Pose {
  const [s, c] = [Math.sin(t * rate), Math.cos(t * rate)]
  return {
    lift: 0.018 * reach * Math.abs(c),
    roll: 0,
    legs: [0.5 * reach * s, -0.5 * reach * s],
    knees: [0.08 + 0.75 * reach * Math.max(0, -c), 0.08 + 0.75 * reach * Math.max(0, c)],
    arms: [-0.38 * reach * s, 0.38 * reach * s],
    elbows: [-0.3 * reach - 0.15 * Math.max(0, s), -0.3 * reach - 0.15 * Math.max(0, -s)],
  }
}

export function talkingPose(t: number): Pose {
  const [left, right] = [Math.max(0, Math.sin(t * 2.1)), Math.max(0, Math.sin(t * 2.7 + 1))]
  return {
    lift: Math.abs(Math.sin(t * 1.3)) * 0.01,
    roll: 0,
    legs: [0, 0],
    knees: [0, 0],
    arms: [-0.15 - 0.2 * left, -0.3 - 0.35 * right],
    elbows: [-0.5 - 0.35 * left, -0.9 - 0.45 * right],
  }
}

export function activityPose(activity: Activity, t: number): Pose {
  const wave = (rate: number, phase = 0) => Math.sin(t * rate + phase)
  switch (activity) {
    case 'coding':
      return seated([-0.95, -0.95], [-0.75 + 0.06 * wave(17), -0.75 + 0.06 * wave(19, 1)])
    case 'coffee':
    case 'eating': {
      const sip = Math.max(0, wave(0.9)) ** 6
      return seated([-0.6, -0.5 - 0.5 * sip], [-0.9, -0.9 - 1.1 * sip])
    }
    case 'reading':
      return seated([-0.7, -0.7], [-1.3, -1.3 + 0.05 * wave(0.4)])
    case 'chess': {
      const reach = Math.max(0, wave(0.6)) ** 8
      return seated([-0.6, -0.6 - 0.5 * reach], [-1, -1 + 0.6 * reach])
    }
    case 'picnic':
      return {
        lift: -0.5,
        roll: 0,
        legs: [-1.45, -1.45],
        knees: [0.25, 0.25],
        arms: [0.35, -0.3 - 0.6 * Math.max(0, wave(0.7)) ** 4],
        elbows: [-0.2, -0.6],
      }
    case 'music':
      return {
        lift: Math.abs(wave(4)) * 0.025,
        roll: 0.05 * wave(2),
        legs: [0, 0],
        knees: [0.05, 0.05],
        arms: [-0.7, -0.45],
        elbows: [-1.4, -1 + 0.35 * wave(9)],
      }
    case 'art':
      return { ...standing, arms: [0.05, -1.2 + 0.3 * wave(3)], elbows: [-0.15, -0.5] }
    case 'climbing': {
      const climb = 0.5 + 0.5 * wave(0.45)
      return {
        lift: climb * 0.9,
        roll: 0,
        legs: [0.4 * wave(2) - 0.3, -0.4 * wave(2) - 0.3],
        knees: [0.6, 0.6],
        arms: [-2.8 + 0.3 * wave(2), -2.8 - 0.3 * wave(2)],
        elbows: [-0.3, -0.3],
      }
    }
    case 'running':
      return walkingPose(t, 14, 1.5)
    case 'hiking':
      return walkingPose(t, 7)
    case 'surfing':
    case 'sailing':
      return {
        lift: -0.05 + 0.03 * wave(1.5),
        roll: 0.15 * wave(1.2),
        legs: [-0.35, 0.25],
        knees: [0.6, 0.45],
        arms: [-0.25, 0.3],
        elbows: [-0.3, -0.3],
      }
    case 'tinkering':
      return {
        lift: -0.12,
        roll: 0,
        legs: [-0.7, -0.4],
        knees: [1, 0.6],
        arms: [-0.8, -0.9 + 0.4 * Math.abs(wave(6))],
        elbows: [-0.7, -0.9],
      }
    case 'pitching': {
      const [left, right] = [Math.max(0, wave(1.6)), Math.max(0, wave(2.3, 2))]
      return {
        ...standing,
        arms: [-0.3 - 0.5 * left, -0.6 - 0.5 * right],
        elbows: [-0.6 - 0.3 * left, -0.9],
      }
    }
    case 'chatting':
      return talkingPose(t)
  }
}
