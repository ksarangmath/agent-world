import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  type BufferGeometry,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { colored } from '../paint'

type At = [x: number, y: number, z: number]

const merge = (...parts: BufferGeometry[]) => mergeGeometries(parts)

const box = (w: number, h: number, d: number, [x, y, z]: At, hex: string, yaw = 0) =>
  colored(new BoxGeometry(w, h, d).rotateY(yaw).translate(x, y + h / 2, z), hex)

const blob = (radius: number, [sx, sy, sz]: At, [x, y, z]: At, hex: string) =>
  colored(new IcosahedronGeometry(radius, 0).scale(sx, sy, sz).translate(x, y, z), hex)

const cone = (radius: number, height: number, [x, y, z]: At, hex: string, sides = 7) =>
  colored(new ConeGeometry(radius, height, sides).translate(x, y + height / 2, z), hex)

const disc = (radius: number, height: number, [x, y, z]: At, hex: string) =>
  colored(new CylinderGeometry(radius, radius, height, 10).translate(x, y + height / 2, z), hex)

const frond = (yaw: number) =>
  colored(
    new BoxGeometry(0.75, 0.05, 0.16)
      .translate(0.36, 0, 0)
      .rotateZ(-0.35)
      .rotateY(yaw)
      .translate(0, 1.72, 0),
    '#3f8f3a',
  )

const bands = (colors: string[]) =>
  merge(
    ...colors.map((hex, i) =>
      box(1 / colors.length, 1, 0.04, [-0.5 + (i + 0.5) / colors.length, 0, 0], hex),
    ),
  )

const rainbow = ['#e40303', '#ff8c00', '#ffed00', '#008026', '#24408e', '#732982']

const wheels = (width: number, length: number) =>
  [-1, 1].flatMap((side) =>
    [-1, 1].map((end) =>
      box(0.08, 0.12, 0.14, [(side * width) / 2, 0, (end * length) / 2], '#22223b'),
    ),
  )

export const litKits = {
  palm: merge(
    box(0.09, 1.72, 0.09, [0, 0, 0], '#8a6a46'),
    ...[0, 1, 2, 3, 4].map((k) => frond(k * 1.26)),
  ),
  muralSun: merge(
    bands(['#ff006e', '#fb5607', '#ffbe0b', '#3a86ff']),
    box(0.4, 0.4, 0.05, [0, 0.3, 0.005], '#ffd60a'),
    box(0.9, 0.12, 0.05, [0, 0.1, 0.006], '#8338ec'),
  ),
  muralWave: merge(
    bands(['#06d6a0', '#118ab2', '#073b4c', '#ef476f', '#ffd166']),
    box(0.8, 0.14, 0.05, [0, 0.55, 0.005], '#f1faee'),
    box(0.3, 0.3, 0.05, [0.2, 0.15, 0.006], '#ef476f'),
  ),
  muralTieDye: merge(
    box(1, 1, 0.04, [0, 0, 0], '#9d4edd'),
    box(0.76, 0.76, 0.045, [0, 0.12, 0.002], '#ff70a6'),
    box(0.52, 0.52, 0.05, [0, 0.24, 0.004], '#ffd670'),
    box(0.28, 0.28, 0.055, [0, 0.36, 0.006], '#70d6ff'),
    box(0.1, 0.1, 0.06, [0, 0.45, 0.008], '#e9ff70'),
  ),
  tacoTruck: merge(
    box(0.5, 0.42, 1, [0, 0.12, 0], '#f4d35e'),
    box(0.5, 0.3, 0.3, [0, 0.12, 0.62], '#f4d35e'),
    box(0.52, 0.12, 0.25, [0, 0.3, 0.62], '#2b2d42'),
    box(0.02, 0.18, 0.55, [0.26, 0.32, -0.05], '#2b2d42'),
    box(0.14, 0.03, 0.6, [0.32, 0.52, -0.05], '#e63946'),
    box(0.34, 0.14, 0.04, [0, 0.54, 0.15], '#e76f51'),
    ...wheels(0.5, 0.8),
  ),
  scooter: merge(
    box(0.08, 0.03, 0.3, [0, 0.05, 0], '#1d3557'),
    box(0.03, 0.32, 0.03, [0, 0.05, 0.13], '#adb5bd'),
    box(0.18, 0.02, 0.02, [0, 0.37, 0.13], '#212529'),
    box(0.04, 0.06, 0.06, [0, 0, 0.13], '#212529'),
    box(0.04, 0.06, 0.06, [0, 0, -0.13], '#212529'),
  ),
  robot: merge(
    box(0.16, 0.1, 0.12, [0, 0, 0], '#6c757d'),
    box(0.22, 0.2, 0.16, [0, 0.1, 0], '#e9ecef'),
    box(0.16, 0.12, 0.14, [0, 0.3, 0], '#ced4da'),
    box(0.11, 0.03, 0.01, [0, 0.35, 0.075], '#00b4d8'),
    box(0.015, 0.08, 0.015, [0, 0.42, 0], '#495057'),
    box(0.04, 0.04, 0.04, [0, 0.5, 0], '#ef476f'),
  ),
  container: merge(
    box(0.7, 0.6, 1.8, [0, 0, 0], '#ffffff'),
    ...[-0.75, -0.25, 0.25, 0.75].map((z) => box(0.72, 0.62, 0.05, [0, 0, z], '#c8c8c8')),
  ),
  billboard: merge(
    box(0.05, 1, 0.05, [-0.45, 0, 0], '#6c757d'),
    box(0.05, 1, 0.05, [0.45, 0, 0], '#6c757d'),
    box(1.2, 0.6, 0.06, [0, 1, 0], '#ffffff'),
    box(1.1, 0.12, 0.07, [0, 1.38, 0], '#ffd166'),
    box(0.3, 0.3, 0.07, [-0.3, 1.1, 0.01], '#f1faee'),
  ),
  fountain: merge(
    disc(0.6, 0.18, [0, 0, 0], '#cfd8dc'),
    disc(0.52, 0.05, [0, 0.14, 0], '#6ec6ff'),
    disc(0.09, 0.5, [0, 0.18, 0], '#cfd8dc'),
    disc(0.22, 0.06, [0, 0.66, 0], '#bde0fe'),
  ),
  towerFlag: merge(
    box(0.04, 1.2, 0.04, [0, 0, 0], '#adb5bd'),
    box(0.5, 0.3, 0.02, [0.27, 0.82, 0], '#ffffff'),
  ),
  rainbowFlag: merge(
    box(0.04, 1.5, 0.04, [0, 0, 0], '#adb5bd'),
    ...rainbow.map((hex, i) => box(0.5, 0.06, 0.02, [0.27, 1.38 - i * 0.06, 0], hex)),
  ),
  gate: merge(
    box(0.18, 1.6, 0.18, [-1.1, 0, 0], '#c1121f'),
    box(0.18, 1.6, 0.18, [1.1, 0, 0], '#c1121f'),
    box(2.6, 0.15, 0.22, [0, 1.35, 0], '#c1121f'),
    box(3, 0.18, 0.5, [0, 1.62, 0], '#2a9d8f'),
    box(0.4, 0.14, 0.5, [-1.4, 1.74, 0], '#2a9d8f'),
    box(0.4, 0.14, 0.5, [1.4, 1.74, 0], '#2a9d8f'),
    box(0.6, 0.25, 0.05, [0, 1.05, 0.12], '#ffd166'),
  ),
  umbrella: merge(
    box(0.04, 0.8, 0.04, [0, 0, 0], '#f8f9fa'),
    cone(0.55, 0.25, [0, 0.78, 0], '#ffffff', 8),
    cone(0.12, 0.08, [0, 1.02, 0], '#f8f9fa', 8),
  ),
  rainbowDecal: merge(
    ...rainbow.map((hex, i) => box(0.9, 0.012, 0.13, [0, 0.01, -0.33 + i * 0.13], hex)),
  ),
  flowerBus: merge(
    box(0.5, 0.3, 1, [0, 0.1, 0], '#4ecdc4'),
    box(0.5, 0.22, 1, [0, 0.4, 0], '#f7fff7'),
    box(0.52, 0.12, 0.82, [0, 0.45, -0.04], '#457b9d'),
    box(0.06, 0.06, 0.06, [0.26, 0.22, 0.2], '#ff6b6b'),
    box(0.06, 0.06, 0.06, [0.26, 0.26, -0.2], '#ffe66d'),
    box(0.06, 0.06, 0.06, [-0.26, 0.24, 0], '#ff9f1c'),
    box(0.12, 0.12, 0.02, [0, 0.36, 0.5], '#ffe66d'),
    ...wheels(0.5, 0.75),
  ),
  foodStall: merge(
    box(0.8, 0.4, 0.4, [0, 0, 0], '#8d6e63'),
    box(0.04, 0.5, 0.04, [-0.4, 0.4, -0.2], '#5d4037'),
    box(0.04, 0.5, 0.04, [0.4, 0.4, -0.2], '#5d4037'),
    box(0.95, 0.06, 0.6, [0, 0.9, 0.05], '#ffffff'),
    ...[-0.32, 0, 0.32].map((x) => box(0.16, 0.065, 0.6, [x, 0.9, 0.05], '#f8f9fa')),
    box(0.5, 0.15, 0.03, [0, 1, 0.34], '#ffd166'),
  ),
  surfShack: merge(
    box(0.9, 0.6, 0.7, [0, 0, 0], '#c9a66b'),
    box(1.05, 0.08, 0.85, [0, 0.6, 0], '#e9c46a'),
    box(0.22, 0.36, 0.02, [0, 0, 0.36], '#6d4c41'),
    box(0.1, 0.7, 0.03, [0.32, 0, 0.42], '#2ec4b6', 0.15),
    box(0.1, 0.65, 0.03, [0.44, 0, 0.42], '#ff9f1c', -0.1),
    box(0.1, 0.72, 0.03, [-0.36, 0, 0.42], '#e71d36', 0.05),
  ),
  surfboard: box(0.11, 0.75, 0.03, [0, 0, 0], '#ffffff'),
  volleyballNet: merge(
    box(0.04, 0.8, 0.04, [-1, 0, 0], '#e9ecef'),
    box(0.04, 0.8, 0.04, [1, 0, 0], '#e9ecef'),
    box(2, 0.28, 0.01, [0, 0.5, 0], '#f1faee'),
  ),
  bonfire: merge(
    box(0.5, 0.08, 0.08, [0, 0, 0], '#6d4c41'),
    box(0.5, 0.08, 0.08, [0, 0.04, 0], '#5d4037', 1.05),
    box(0.5, 0.08, 0.08, [0, 0.08, 0], '#6d4c41', 2.1),
    ...[0, 1, 2, 3, 4, 5].map((k) =>
      box(0.1, 0.08, 0.1, [0.32 * Math.cos(k * 1.05), 0, 0.32 * Math.sin(k * 1.05)], '#8d99ae'),
    ),
  ),
  flowerClump: merge(
    box(0.32, 0.04, 0.32, [0, 0, 0], '#52b788'),
    box(0.09, 0.09, 0.09, [-0.08, 0.04, -0.06], '#ff70a6'),
    box(0.09, 0.09, 0.09, [0.08, 0.04, -0.04], '#ffd670'),
    box(0.09, 0.09, 0.09, [0, 0.04, 0.09], '#ffffff'),
    box(0.09, 0.09, 0.09, [0.1, 0.04, 0.1], '#c77dff'),
  ),
  tulips: merge(
    ...[-0.4, -0.24, -0.08, 0.08, 0.24, 0.4].flatMap((x) => [
      box(0.02, 0.18, 0.02, [x, 0, 0], '#2d6a4f'),
      box(0.08, 0.09, 0.08, [x, 0.18, 0], '#ffffff'),
    ]),
  ),
  fence: merge(
    box(0.05, 0.42, 0.05, [-0.5, 0, 0], '#8d6e63'),
    box(1, 0.04, 0.03, [0, 0.18, 0], '#a1887f'),
    box(1, 0.04, 0.03, [0, 0.34, 0], '#a1887f'),
  ),
  bison: merge(
    box(0.5, 0.32, 0.8, [0, 0.18, 0], '#5c4033'),
    box(0.48, 0.2, 0.36, [0, 0.48, 0.16], '#4a3326'),
    box(0.3, 0.28, 0.26, [0, 0.24, 0.5], '#3e2a1e'),
    box(0.42, 0.04, 0.04, [0, 0.48, 0.56], '#f1e3c6'),
    box(0.05, 0.05, 0.02, [0.08, 0.4, 0.64], '#111111'),
    box(0.05, 0.05, 0.02, [-0.08, 0.4, 0.64], '#111111'),
    ...[-1, 1].flatMap((side) =>
      [-1, 1].map((end) => box(0.09, 0.18, 0.09, [side * 0.16, 0, end * 0.28], '#3e2a1e')),
    ),
  ),
  floatingDock: merge(
    box(1.6, 0.08, 1, [0, 0, 0], '#a0784e'),
    box(1.6, 0.09, 0.08, [0, 0, 0.46], '#7f5539'),
    box(1.6, 0.09, 0.08, [0, 0, -0.46], '#7f5539'),
  ),
  crabStand: merge(
    box(0.7, 0.4, 0.4, [0, 0, 0], '#e63946'),
    box(0.04, 0.45, 0.04, [-0.34, 0.4, -0.18], '#f1faee'),
    box(0.04, 0.45, 0.04, [0.34, 0.4, -0.18], '#f1faee'),
    box(0.85, 0.05, 0.5, [0, 0.85, 0], '#f1faee'),
    blob(0.12, [1.4, 0.7, 1], [0, 1.02, 0.27], '#f77f00'),
  ),
  giantRedwood: merge(
    box(0.38, 2.4, 0.38, [0, 0, 0], '#8b3a2b'),
    cone(1.15, 2.3, [0, 1.6, 0], '#1b4332'),
    cone(0.9, 1.9, [0, 2.9, 0], '#2d6a4f'),
    cone(0.58, 1.5, [0, 4.05, 0], '#1b4332'),
  ),
  oak: merge(
    box(0.22, 0.55, 0.22, [0, 0, 0], '#6d4c41'),
    blob(0.85, [1.25, 0.75, 1.2], [0, 1.05, 0], '#7a9a3a'),
    blob(0.5, [1.1, 0.8, 1.1], [0.45, 1.3, 0.25], '#8aa84a'),
  ),
  vines: merge(
    box(0.03, 0.36, 0.03, [-0.45, 0, 0], '#8d6e63'),
    box(0.03, 0.36, 0.03, [0.45, 0, 0], '#8d6e63'),
    box(0.95, 0.2, 0.22, [0, 0.14, 0], '#4f772d'),
    box(0.08, 0.08, 0.08, [-0.2, 0.12, 0.11], '#6a4c93'),
    box(0.08, 0.08, 0.08, [0.25, 0.14, 0.11], '#6a4c93'),
  ),
  blossomTree: merge(
    box(0.12, 0.45, 0.12, [0, 0, 0], '#6d4c41'),
    blob(0.46, [1, 0.85, 1], [0, 0.78, 0], '#ffafcc'),
    box(0.1, 0.1, 0.1, [0.22, 0.95, 0.15], '#ffe5ec'),
    box(0.1, 0.1, 0.1, [-0.2, 0.7, -0.2], '#ffe5ec'),
  ),
  solarPanel: merge(
    box(0.04, 0.3, 0.04, [0, 0, 0], '#6c757d'),
    colored(new BoxGeometry(0.9, 0.04, 0.6).rotateX(-0.5).translate(0, 0.38, 0), '#1d3557'),
    colored(new BoxGeometry(0.92, 0.035, 0.05).rotateX(-0.5).translate(0, 0.39, 0), '#a8dadc'),
  ),
  hydrangea: merge(
    box(0.36, 0.12, 0.26, [0, 0, 0], '#40916c'),
    blob(0.2, [1.2, 0.85, 1], [-0.07, 0.2, 0], '#ffffff'),
    blob(0.15, [1, 0.9, 1], [0.12, 0.17, 0.02], '#ffffff'),
  ),
  lampPost: merge(
    box(0.05, 1.3, 0.05, [0, 0, 0], '#2b2d42'),
    box(0.26, 0.04, 0.04, [0.11, 1.28, 0], '#2b2d42'),
  ),
  bench: merge(
    box(0.6, 0.05, 0.2, [0, 0.2, 0], '#a0784e'),
    box(0.6, 0.16, 0.04, [0, 0.27, -0.09], '#a0784e'),
    box(0.04, 0.2, 0.18, [-0.26, 0, 0], '#495057'),
    box(0.04, 0.2, 0.18, [0.26, 0, 0], '#495057'),
  ),
}

export const glowKits = {
  lampLight: box(0.13, 0.08, 0.13, [0.22, 1.18, 0], '#fff1b8'),
  neon: merge(
    box(0.56, 0.04, 0.03, [0, 0.32, 0], '#ffffff'),
    box(0.56, 0.04, 0.03, [0, 0, 0], '#ffffff'),
    box(0.04, 0.32, 0.03, [-0.26, 0, 0], '#ffffff'),
    box(0.04, 0.32, 0.03, [0.26, 0, 0], '#ffffff'),
    box(0.3, 0.04, 0.03, [0, 0.14, 0], '#ffffff', 0.4),
  ),
  bulb: box(0.07, 0.07, 0.07, [0, 0, 0], '#ffffff'),
  lantern: merge(
    box(0.13, 0.16, 0.13, [0, 0, 0], '#e5383b'),
    box(0.08, 0.03, 0.08, [0, 0.16, 0], '#ffd166'),
  ),
}

export const creatureKits = {
  flame: merge(
    cone(0.18, 0.45, [0, 0, 0], '#ff7b00', 6),
    cone(0.1, 0.32, [0, 0.02, 0], '#ffd166', 6),
  ),
  seaLion: merge(
    blob(0.3, [1, 0.55, 1.7], [0, 0.16, 0], '#5e503f'),
    box(0.17, 0.16, 0.18, [0, 0.16, 0.42], '#5e503f'),
    box(0.06, 0.05, 0.05, [0, 0.21, 0.52], '#2b2118'),
  ),
  kite: merge(
    colored(new BoxGeometry(0.42, 0.42, 0.02).rotateZ(Math.PI / 4), '#ffffff'),
    box(0.04, 0.08, 0.02, [0, -0.44, 0], '#ffffff'),
    box(0.04, 0.08, 0.02, [0.03, -0.58, 0], '#ffffff'),
  ),
  string: box(0.015, 1, 0.015, [0, 0, 0], '#f1faee'),
  whale: merge(
    blob(1, [0.9, 0.5, 2.4], [0, 0, 0], '#22344d'),
    blob(0.8, [0.85, 0.3, 2], [0, -0.15, 0.1], '#d0e1f9'),
    box(1.5, 0.08, 0.45, [0, 0, -2.4], '#22344d'),
    box(0.1, 0.3, 0.4, [0, 0.35, -0.8], '#22344d'),
    box(0.12, 0.05, 0.12, [0.35, 0.3, 1.4], '#f1faee'),
    box(0.12, 0.05, 0.12, [-0.35, 0.3, 1.4], '#f1faee'),
  ),
  spout: merge(
    cone(0.16, 1.1, [0, 0, 0], '#e0fbfc', 6),
    cone(0.32, 0.25, [0, 1.05, 0], '#e0fbfc', 6),
  ),
  dolphin: merge(
    blob(0.2, [0.9, 0.9, 3], [0, 0, 0], '#8d99ae'),
    box(0.04, 0.18, 0.14, [0, 0.14, -0.05], '#6c7a89'),
    box(0.3, 0.03, 0.1, [0, 0, -0.62], '#6c7a89'),
  ),
  mist: colored(new IcosahedronGeometry(1, 1).scale(1, 0.35, 1), '#ffffff'),
}

export type LitKit = keyof typeof litKits
export type GlowKit = keyof typeof glowKits
