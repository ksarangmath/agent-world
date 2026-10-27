import {
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  LatheGeometry,
  Matrix4,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Avatar } from '../../shared/profile'

type Build = Avatar['build']
type Face = Avatar['face_shape']
type Line = { front: number; side: number; back: number }
type Swell = (p: Vector3) => number
type ShellOptions = { grow: number; keep?: (p: Vector3) => boolean; swell?: Swell }

const smoothstep = (from: number, to: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - from) / (to - from)))
  return t * t * (3 - 2 * t)
}
const bump = (x: number, center: number, width: number) => Math.exp(-(((x - center) / width) ** 2))

function plain(geometry: BufferGeometry): BufferGeometry {
  const result = new BufferGeometry()
  const position = geometry.getAttribute('position')
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
  result.setAttribute('position', position)
  result.setAttribute('normal', geometry.getAttribute('normal'))
  result.setIndex(geometry.getIndex() ?? Array.from({ length: position.count }, (_, i) => i))
  return result
}

function smooth(geometry: BufferGeometry): BufferGeometry {
  const bare = new BufferGeometry()
  bare.setAttribute('position', geometry.getAttribute('position'))
  bare.setIndex(geometry.getIndex())
  const merged = mergeVertices(bare)
  merged.computeVertexNormals()
  return merged
}

const merge = (...parts: BufferGeometry[]) => mergeGeometries(parts.map(plain))!

function mirror(geometry: BufferGeometry): BufferGeometry {
  const flipped = plain(geometry).scale(-1, 1, 1)
  const index = flipped.getIndex()!
  for (let i = 0; i < index.count; i += 3) {
    const first = index.getX(i + 1)
    index.setX(i + 1, index.getX(i + 2))
    index.setX(i + 2, first)
  }
  return flipped
}

const ellipsoid = (x: number, y: number, z: number, detail = 12) =>
  new SphereGeometry(1, detail, Math.max(6, Math.round(detail * 0.75))).scale(x, y, z)

const lathe = (profile: [radius: number, y: number][], segments = 18) =>
  smooth(
    new LatheGeometry(
      profile.map(([r, y]) => new Vector2(r, y)),
      segments,
    ),
  )

const arc = (radius: number, tube: number, angle: number, center: number) =>
  new TorusGeometry(radius, tube, 6, 18, angle).rotateZ(center - angle / 2)

const builds: Record<
  Build,
  {
    hip: number
    waist: number
    chest: number
    shoulder: number
    depth: number
    limb: number
    neck: number
  }
> = {
  slim: { hip: 0.92, waist: 0.9, chest: 0.92, shoulder: 0.95, depth: 0.6, limb: 0.88, neck: 0.92 },
  average: { hip: 1, waist: 1, chest: 1, shoulder: 1, depth: 0.64, limb: 1, neck: 1 },
  athletic: { hip: 1, waist: 0.98, chest: 1.1, shoulder: 1.12, depth: 0.66, limb: 1.1, neck: 1.1 },
  curvy: {
    hip: 1.12,
    waist: 0.95,
    chest: 1.06,
    shoulder: 0.98,
    depth: 0.68,
    limb: 1.1,
    neck: 0.96,
  },
  heavy: { hip: 1.14, waist: 1.3, chest: 1.16, shoulder: 1.08, depth: 0.8, limb: 1.22, neck: 1.18 },
}

export const skeletons = Object.fromEntries(
  Object.entries(builds).map(([build, shape]) => [
    build,
    {
      shoulder: { x: 0.143 * shape.shoulder, y: 0.846 },
      hip: { x: 0.062 * shape.hip, y: 0.552 },
      elbow: -0.255,
      knee: -0.27,
    },
  ]),
) as Record<
  Build,
  { shoulder: { x: number; y: number }; hip: { x: number; y: number }; elbow: number; knee: number }
>

const torsoProfile: [number, number][] = [
  [0, 0.548],
  [0.11, 0.552],
  [0.116, 0.58],
  [0.103, 0.64],
  [0.097, 0.68],
  [0.106, 0.74],
  [0.122, 0.8],
  [0.128, 0.84],
  [0.12, 0.872],
  [0.094, 0.893],
  [0.05, 0.905],
  [0, 0.908],
]

function torsoRadius(build: Build, y: number): number {
  const shape = builds[build]
  const scale =
    1 +
    (shape.hip - 1) * bump(y, 0.57, 0.04) +
    (shape.waist - 1) * bump(y, 0.66, 0.06) +
    (shape.chest - 1) * bump(y, 0.79, 0.06) +
    (shape.shoulder - 1) * bump(y, 0.86, 0.03)
  const upper = torsoProfile.findIndex(([, py]) => py >= y)
  if (upper <= 0) return torsoProfile[Math.max(0, upper)]![0] * scale
  const [r0, y0] = torsoProfile[upper - 1]!
  const [r1, y1] = torsoProfile[upper]!
  return (r0 + ((r1 - r0) * (y - y0)) / (y1 - y0)) * scale
}

const chestZ = (build: Build, x: number, y: number) =>
  builds[build].depth * Math.sqrt(Math.max(0, torsoRadius(build, y) ** 2 - x * x))

function torso(build: Build) {
  const geometry = lathe(
    torsoProfile.map(([r, y]) => [r && torsoRadius(build, y), y]),
    24,
  )
  return geometry.scale(1, 1, builds[build].depth)
}

function patch(build: Build, points: [number, number][], lift = 0.003) {
  const geometry = new BufferGeometry()
  const vertices = points.flatMap(([x, y]) => [x, y, chestZ(build, x, y) + lift])
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  geometry.setIndex(points.slice(1, -1).flatMap((_, i) => [0, i + 1, i + 2]))
  geometry.computeVertexNormals()
  return geometry
}

const mirrored = (build: Build, points: [number, number][], lift?: number) => [
  patch(build, points, lift),
  patch(build, points.map(([x, y]) => [-x, y] as [number, number]).reverse(), lift),
]

const ring = (radius: number, tube: number, y: number, depth: number) =>
  new TorusGeometry(radius, tube, 6, 28)
    .rotateX(Math.PI / 2)
    .scale(1, 1, depth)
    .translate(0, y, 0)

const neckband = (build: Build, tube: number) => ring(0.052 * builds[build].neck, tube, 0.898, 0.86)

const hemband = (build: Build) => ring(torsoRadius(build, 0.556), 0.009, 0.556, builds[build].depth)

const tops = {
  't-shirt': { trim: (build: Build) => neckband(build, 0.0065) },
  sweater: { trim: (build: Build) => merge(neckband(build, 0.009), hemband(build)) },
  shirt: {
    trim: (build: Build) =>
      merge(
        neckband(build, 0.0075),
        ...mirrored(build, [
          [0.006, 0.9],
          [0.05, 0.886],
          [0.03, 0.846],
        ]),
        ...[0.85, 0.79, 0.73, 0.67].map((y) =>
          ellipsoid(0.0045, 0.0045, 0.003, 8).translate(0, y, chestZ(build, 0, y) + 0.002),
        ),
      ),
  },
  hoodie: {
    trim: (build: Build) =>
      merge(
        hemband(build),
        new RoundedBoxGeometry(0.14, 0.07, 0.012, 2, 0.005).translate(
          0,
          0.625,
          chestZ(build, 0, 0.625) + 0.001,
        ),
        arc(0.072, 0.03, Math.PI * 1.15, Math.PI / 2)
          .rotateX(-Math.PI / 2)
          .scale(1.1, 1, 1)
          .translate(0, 0.9, -0.02),
      ),
    inner: (build: Build) =>
      merge(
        ...[-0.022, 0.022].map((x) =>
          new CylinderGeometry(0.0028, 0.0028, 0.085, 6).translate(
            x,
            0.842,
            chestZ(build, x, 0.84) + 0.006,
          ),
        ),
      ),
  },
  jacket: {
    trim: (build: Build) =>
      merge(
        ring(0.054 * builds[build].neck, 0.012, 0.9, 0.9),
        patch(build, [
          [-0.005, 0.89],
          [-0.005, 0.56],
          [0.005, 0.56],
          [0.005, 0.89],
        ]),
      ),
  },
  blazer: {
    trim: (build: Build) =>
      merge(
        ...mirrored(
          build,
          [
            [0.03, 0.9],
            [0.004, 0.735],
            [0.045, 0.79],
            [0.07, 0.875],
          ],
          0.004,
        ),
      ),
    inner: (build: Build) =>
      merge(
        neckband(build, 0.007),
        patch(build, [
          [-0.032, 0.9],
          [0, 0.74],
          [0.032, 0.9],
        ]),
      ),
  },
} satisfies Record<
  Avatar['top_style'],
  Partial<Record<'trim' | 'inner', (build: Build) => BufferGeometry>>
>

const hips = (build: Build) => {
  const scale = builds[build].hip
  return lathe([
    [0, 0.5],
    [0.09 * scale, 0.505],
    [0.112 * scale, 0.54],
    [0.114 * scale, 0.58],
    [0.104 * scale, 0.62],
    [0, 0.63],
  ]).scale(1, 1, builds[build].depth + 0.08)
}

const skirt = (build: Build) => {
  const scale = builds[build].hip
  return lathe([
    [0.168 * scale, 0.4],
    [0.152 * scale, 0.44],
    [0.124 * scale, 0.55],
    [0.116 * scale, 0.6],
  ]).scale(1, 1, builds[build].depth + 0.14)
}

const limb = (profile: [number, number][], build: Build) =>
  lathe(
    profile.map(([r, y]) => [r * builds[build].limb, y]),
    14,
  )

const limbs = {
  upperArm: [
    [0, -0.27],
    [0.033, -0.255],
    [0.036, -0.2],
    [0.041, -0.12],
    [0.043, -0.04],
    [0.04, 0],
    [0.028, 0.022],
    [0, 0.03],
  ],
  forearm: [
    [0, -0.235],
    [0.026, -0.225],
    [0.028, -0.2],
    [0.033, -0.1],
    [0.036, -0.04],
    [0.033, 0],
    [0.02, 0.018],
    [0, 0.022],
  ],
  thigh: [
    [0, -0.285],
    [0.044, -0.27],
    [0.047, -0.24],
    [0.056, -0.14],
    [0.062, -0.04],
    [0.058, 0.01],
    [0.04, 0.035],
    [0, 0.045],
  ],
  shin: [
    [0, -0.262],
    [0.029, -0.25],
    [0.031, -0.22],
    [0.039, -0.14],
    [0.046, -0.06],
    [0.043, -0.01],
    [0.03, 0.012],
    [0, 0.018],
  ],
} satisfies Record<string, [number, number][]>

const headCenter = new Vector3(0, 1.04, 0.004)
const headRadii = new Vector3(0.095, 0.126, 0.104)

const jaws: Record<
  Face,
  { taper: number; from: number; cheek: number; chin: number; length: number }
> = {
  oval: { taper: 0.32, from: 0.15, cheek: 0.05, chin: 0.04, length: 1 },
  round: { taper: 0.2, from: 0.05, cheek: 0.1, chin: 0.02, length: 0.96 },
  square: { taper: 0.24, from: -0.45, cheek: 0.03, chin: 0.05, length: 1 },
  heart: { taper: 0.42, from: 0.2, cheek: 0.09, chin: 0.05, length: 1 },
  long: { taper: 0.3, from: 0.1, cheek: 0.02, chin: 0.04, length: 1.08 },
}

function sculpt(p: Vector3, face: Face): Vector3 {
  const jaw = jaws[face]
  const below = smoothstep(jaw.from, -1, p.y)
  const x =
    p.x *
    (1 - jaw.taper * below ** 1.4) *
    (1 + jaw.cheek * bump(p.y, -0.12, 0.3) * smoothstep(0, 0.7, p.z))
  let z = p.z * (1 - 0.1 * below)
  if (p.z > 0) z += jaw.chin * below * p.z
  if (z < 0) z *= 1 + 0.1 * smoothstep(-0.3, 0.7, p.y)
  if (z > 0.62) z = 0.62 + (z - 0.62) * 0.55
  return new Vector3(x, p.y < 0 ? p.y * jaw.length : p.y, z)
}

const toHead = (unit: Vector3, swell = 1) =>
  new Vector3(
    unit.x * headRadii.x * swell + headCenter.x,
    unit.y * headRadii.y * swell + headCenter.y,
    unit.z * headRadii.z * swell + headCenter.z,
  )

function shell(face: Face, { grow, keep = () => true, swell = () => 1 }: ShellOptions) {
  const sphere = new SphereGeometry(1, 48, 34)
  const position = sphere.getAttribute('position')
  const index = sphere.getIndex()!
  const [a, b, c] = [new Vector3(), new Vector3(), new Vector3()]
  const kept: number[] = []
  for (let i = 0; i < index.count; i += 3) {
    a.fromBufferAttribute(position, index.getX(i))
    b.fromBufferAttribute(position, index.getX(i + 1))
    c.fromBufferAttribute(position, index.getX(i + 2))
    if (keep(a.add(b).add(c).normalize()))
      kept.push(index.getX(i), index.getX(i + 1), index.getX(i + 2))
  }
  for (let i = 0; i < position.count; i++) {
    a.fromBufferAttribute(position, i)
    const placed = toHead(sculpt(a, face), 1 + grow * swell(a))
    position.setXYZ(i, placed.x, placed.y, placed.z)
  }
  sphere.setIndex(kept)
  return smooth(sphere)
}

function facePoint(face: Face, x: number, y: number): Vector3 {
  const unit = (x0: number) => new Vector3(x0, y, Math.sqrt(Math.max(0, 1 - x0 * x0 - y * y)))
  let x0 = x
  for (let k = 0; k < 8; k++) {
    const sculpted = sculpt(unit(x0), face).x
    if (Math.abs(sculpted) > 1e-6) x0 *= x / sculpted
  }
  return toHead(sculpt(unit(x0), face))
}

function onFace(face: Face, geometry: BufferGeometry, x: number, y: number, lift = 0) {
  const step = 0.02
  const point = facePoint(face, x, y)
  const across = facePoint(face, x + step, y).sub(facePoint(face, x - step, y))
  const up = facePoint(face, x, y + step).sub(facePoint(face, x, y - step))
  const normal = across.cross(up).normalize()
  const turn = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), normal)
  return geometry.applyMatrix4(
    new Matrix4().compose(point.addScaledVector(normal, lift), turn, new Vector3(1, 1, 1)),
  )
}

const eyeLevel = 0
const eyeSpread = 0.43

const eyeShapes: Record<
  Avatar['eye_shape'],
  { width: number; height: number; tilt: number; lid: number }
> = {
  almond: { width: 0.027, height: 0.0188, tilt: 0.07, lid: 0.0038 },
  round: { width: 0.0245, height: 0.022, tilt: 0, lid: 0.0036 },
  hooded: { width: 0.026, height: 0.0155, tilt: 0.02, lid: 0.005 },
  monolid: { width: 0.026, height: 0.0135, tilt: 0.12, lid: 0.0042 },
  downturned: { width: 0.026, height: 0.018, tilt: -0.14, lid: 0.0038 },
  upturned: { width: 0.026, height: 0.018, tilt: 0.18, lid: 0.0038 },
}

const eyePieces = {
  whites: ({ width, height }: (typeof eyeShapes)['almond']) => [
    ellipsoid(width, height, 0.009, 14),
  ],
  irises: ({ width, height }: (typeof eyeShapes)['almond']) => {
    const r = Math.min(height * 0.92, width * 0.6)
    return [ellipsoid(r, r, 0.005, 12).translate(0, -0.0008, 0.0055)]
  },
  darks: ({ width, height, lid }: (typeof eyeShapes)['almond']) => {
    const r = Math.min(height * 0.92, width * 0.6)
    return [
      ellipsoid(r * 0.45, r * 0.45, 0.003, 10).translate(0, -0.0008, 0.0086),
      new TorusGeometry(width, lid, 5, 18, Math.PI)
        .scale(1, height / width, 1)
        .translate(0, 0, 0.003),
      ellipsoid(0.0055, lid * 0.8, 0.002, 8)
        .rotateZ(0.5)
        .translate(width * 1.05, height * 0.22, 0.002),
    ]
  },
  glints: ({ width, height }: (typeof eyeShapes)['almond']) => {
    const r = Math.min(height * 0.92, width * 0.6)
    return [ellipsoid(0.0036, 0.0036, 0.002, 8).translate(r * 0.35, r * 0.38, 0.0108)]
  },
}

function eyes(face: Face, eye: Avatar['eye_shape'], piece: keyof typeof eyePieces) {
  const shape = eyeShapes[eye]
  return merge(
    ...[-1, 1].flatMap((side) =>
      eyePieces[piece](shape).map((geometry) =>
        onFace(
          face,
          (side < 0 ? mirror(geometry) : geometry).rotateZ(side * shape.tilt),
          side * eyeSpread,
          eyeLevel,
        ),
      ),
    ),
  )
}

const browWeights: Record<Avatar['brows'], { tube: number; arch: number }> = {
  thin: { tube: 0.0034, arch: 0.55 },
  medium: { tube: 0.005, arch: 0.48 },
  thick: { tube: 0.0072, arch: 0.36 },
}

function brows(face: Face, weight: Avatar['brows']) {
  const { tube, arch } = browWeights[weight]
  return merge(
    ...[-1, 1].map((side) =>
      onFace(
        face,
        arc(0.029, tube, 1.45, Math.PI / 2)
          .scale(1, arch, 1)
          .translate(0, -0.029 * arch, 0)
          .rotateZ(side * -0.06),
        side * eyeSpread,
        0.3,
        0.002,
      ),
    ),
  )
}

const noses: Record<
  Avatar['nose'],
  {
    bridge: [number, number, number]
    tip: [number, number, number]
    wing: number
    spread: number
    drop: number
  }
> = {
  button: {
    bridge: [0.009, 0.022, 0.008],
    tip: [0.0135, 0.012, 0.013],
    wing: 0.0068,
    spread: 0.1,
    drop: 0,
  },
  straight: {
    bridge: [0.0105, 0.03, 0.011],
    tip: [0.0125, 0.011, 0.012],
    wing: 0.0075,
    spread: 0.11,
    drop: 0,
  },
  narrow: {
    bridge: [0.0085, 0.032, 0.011],
    tip: [0.0098, 0.011, 0.011],
    wing: 0.006,
    spread: 0.09,
    drop: 0,
  },
  wide: {
    bridge: [0.012, 0.028, 0.01],
    tip: [0.016, 0.012, 0.012],
    wing: 0.0096,
    spread: 0.15,
    drop: 0,
  },
  aquiline: {
    bridge: [0.0105, 0.034, 0.0145],
    tip: [0.012, 0.012, 0.013],
    wing: 0.0075,
    spread: 0.11,
    drop: 0.03,
  },
}

function nose(face: Face, kind: Avatar['nose']) {
  const { bridge, tip, wing, spread, drop } = noses[kind]
  return merge(
    onFace(face, ellipsoid(...bridge), 0, -0.15, 0.001),
    onFace(face, ellipsoid(...tip), 0, -0.31 - drop, 0.008),
    ...[-1, 1].map((side) =>
      onFace(face, ellipsoid(wing, wing * 0.9, wing), side * spread, -0.33 - drop, 0.002),
    ),
  )
}

const lipWeights: Record<Avatar['lips'], { upper: number; lower: [number, number, number] }> = {
  thin: { upper: 0.0035, lower: [0.016, 0.0055, 0.007] },
  medium: { upper: 0.005, lower: [0.018, 0.0075, 0.0085] },
  full: { upper: 0.0066, lower: [0.02, 0.0096, 0.0102] },
}

function lips(face: Face, weight: Avatar['lips']) {
  const { upper, lower } = lipWeights[weight]
  return merge(
    onFace(face, arc(0.05, upper, 0.72, -Math.PI / 2).translate(0, 0.05, 0), 0, -0.53, 0.004),
    onFace(face, ellipsoid(...lower).translate(0, -upper - lower[1] * 0.7, 0.001), 0, -0.53, 0.004),
  )
}

const cheeks = (face: Face) =>
  merge(...[-1, 1].map((side) => onFace(face, ellipsoid(0.019, 0.011, 0.004), side * 0.55, -0.3)))

function head(face: Face) {
  return merge(
    shell(face, { grow: 0 }),
    ...[-1, 1].map((side) => {
      const point = toHead(sculpt(new Vector3(side, -0.06, -0.05).normalize(), face))
      return ellipsoid(0.011, 0.027, 0.018)
        .rotateY(side * 0.35)
        .translate(point.x - side * 0.004, point.y, point.z)
    }),
  )
}

const neck = (build: Build) =>
  new CylinderGeometry(0.038 * builds[build].neck, 0.043 * builds[build].neck, 0.15, 14).translate(
    0,
    0.915,
    -0.006,
  )

const hairline =
  ({ front, side, back }: Line, temples = 0) =>
  (p: Vector3) => {
    const level =
      p.z >= 0
        ? side +
          (front - side) * smoothstep(0.15, 0.85, p.z) +
          temples * smoothstep(0.2, 0.5, Math.abs(p.x)) * smoothstep(0.3, 0.8, p.z)
        : side + (back - side) * smoothstep(0.1, 0.85, -p.z)
    return p.y > level
  }

const framing = (bangs: number, bottom: number) => (p: Vector3) =>
  p.y > bottom && !(p.z > 0.3 && Math.abs(p.x) < 0.74 && p.y < bangs)

const lumps =
  (frequency: number, amount: number): Swell =>
  (p) =>
    1 +
    amount *
      Math.sin(p.x * frequency) *
      Math.sin(p.y * frequency + 1) *
      Math.sin(p.z * frequency + 2)

function curtain({
  bottom,
  spread,
  wave = 0,
  flare = 0.02,
}: {
  bottom: number
  spread: number
  wave?: number
  flare?: number
}) {
  const top = 1.03
  const geometry = new CylinderGeometry(
    0.1,
    0.112 + flare,
    top - bottom,
    32,
    12,
    true,
    Math.PI * (1 - spread),
    Math.PI * 2 * spread,
  )
  const position = geometry.getAttribute('position')
  const p = new Vector3()
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i)
    const angle = Math.atan2(p.x, p.z)
    const r = Math.hypot(p.x, p.z) + wave * Math.sin(angle * 9 + p.y * 40)
    position.setXYZ(i, Math.sin(angle) * r * 1.28, p.y, Math.cos(angle) * r)
  }
  geometry.computeVertexNormals()
  return geometry.translate(0, (top + bottom) / 2, -0.016)
}

function strands(count: number, radius: number, bottom: number, spread: number) {
  return merge(
    ...Array.from({ length: count }, (_, i) => {
      const angle = Math.PI * (1 - spread) + (Math.PI * 2 * spread * (i + 0.5)) / count
      const length = 1.02 - bottom - 0.03 * Math.abs(Math.sin(i * 1.7))
      return new CylinderGeometry(radius, radius * 0.75, length, 6).translate(
        Math.sin(angle) * 0.118,
        1.02 - length / 2,
        Math.cos(angle) * 0.1 - 0.012,
      )
    }),
  )
}

const tight = (face: Face) =>
  shell(face, { grow: 0.04, keep: hairline({ front: 0.5, side: 0.02, back: -0.45 }) })

const hairStyles: Record<Avatar['hair_style'], ((face: Face) => BufferGeometry) | null> = {
  bald: null,
  buzzed: (face) =>
    shell(face, { grow: 0.015, keep: hairline({ front: 0.52, side: 0.08, back: -0.42 }) }),
  receding: (face) =>
    shell(face, { grow: 0.045, keep: hairline({ front: 0.6, side: 0.05, back: -0.45 }, 0.14) }),
  short: (face) =>
    shell(face, {
      grow: 0.07,
      keep: hairline({ front: 0.5, side: 0.05, back: -0.45 }),
      swell: (p) => 1 + 0.7 * smoothstep(0.5, 1, p.y),
    }),
  'side-part': (face) =>
    shell(face, {
      grow: 0.075,
      keep: hairline({ front: 0.44, side: 0.04, back: -0.45 }),
      swell: (p) => 1 + 0.9 * smoothstep(-0.2, 0.7, p.x) * smoothstep(0.2, 0.9, p.y),
    }),
  quiff: (face) =>
    shell(face, {
      grow: 0.06,
      keep: hairline({ front: 0.48, side: 0.05, back: -0.45 }),
      swell: (p) => 1 + 2.6 * smoothstep(0.2, 0.8, p.z) * smoothstep(0.55, 0.95, p.y),
    }),
  'short-curly': (face) =>
    shell(face, {
      grow: 0.12,
      keep: hairline({ front: 0.45, side: 0, back: -0.45 }),
      swell: lumps(14, 0.14),
    }),
  afro: (face) =>
    shell(face, {
      grow: 0.42,
      keep: hairline({ front: 0.4, side: -0.12, back: -0.55 }),
      swell: lumps(12, 0.07),
    }),
  pixie: (face) =>
    shell(face, {
      grow: 0.07,
      keep: (p) =>
        hairline({ front: 0.3 - 0.16 * smoothstep(-0.3, 0.5, p.x), side: 0, back: -0.5 })(p),
      swell: (p) => 1 + 0.5 * smoothstep(0.4, 1, p.y),
    }),
  medium: (face) =>
    shell(face, {
      grow: 0.09,
      keep: hairline({ front: 0.28, side: -0.4, back: -0.75 }),
      swell: (p) => 1 + 0.6 * smoothstep(-0.1, -0.7, p.y),
    }),
  bob: (face) =>
    shell(face, {
      grow: 0.1,
      keep: framing(0.3, -0.82),
      swell: (p) => 1 + 1.3 * smoothstep(0, -0.8, p.y),
    }),
  'long-straight': (face) =>
    merge(
      shell(face, { grow: 0.08, keep: framing(0.34, -0.95) }),
      curtain({ bottom: 0.7, spread: 0.55 }),
    ),
  'long-wavy': (face) =>
    merge(
      shell(face, { grow: 0.1, keep: framing(0.32, -0.95), swell: lumps(9, 0.08) }),
      curtain({ bottom: 0.7, spread: 0.58, wave: 0.006, flare: 0.035 }),
    ),
  'long-curly': (face) =>
    merge(
      shell(face, { grow: 0.16, keep: framing(0.34, -0.95), swell: lumps(13, 0.12) }),
      curtain({ bottom: 0.74, spread: 0.6, wave: 0.011, flare: 0.05 }),
    ),
  braids: (face) =>
    merge(
      shell(face, { grow: 0.03, keep: hairline({ front: 0.45, side: -0.1, back: -0.5 }) }),
      strands(16, 0.009, 0.7, 0.62),
    ),
  locs: (face) =>
    merge(
      shell(face, {
        grow: 0.06,
        keep: hairline({ front: 0.4, side: -0.1, back: -0.55 }),
        swell: lumps(16, 0.1),
      }),
      strands(13, 0.014, 0.8, 0.66),
    ),
  ponytail: (face) =>
    merge(
      tight(face),
      lathe([
        [0, -0.2],
        [0.016, -0.19],
        [0.026, -0.12],
        [0.03, -0.05],
        [0.024, 0],
        [0, 0.01],
      ])
        .rotateX(0.35)
        .translate(0, 1.08, -0.112),
      new TorusGeometry(0.022, 0.006, 6, 14).rotateX(Math.PI / 2 + 0.35).translate(0, 1.08, -0.112),
    ),
  bun: (face) => merge(tight(face), ellipsoid(0.05, 0.045, 0.05, 16).translate(0, 1.175, -0.035)),
  'man-bun': (face) =>
    merge(tight(face), ellipsoid(0.034, 0.03, 0.034, 14).translate(0, 1.15, -0.088)),
}

const mouthArea = (p: Vector3) => Math.abs(p.x) < 0.3 && p.y > -0.68 && p.y < -0.44 && p.z > 0.6
const beardArea = (p: Vector3) =>
  p.z > -0.2 &&
  p.y < -0.12 - 0.22 * smoothstep(0.3, 0.9, p.z) &&
  !mouthArea(p) &&
  !(Math.abs(p.x) < 0.22 && p.y > -0.44 && p.z > 0.6)

const mustache = (face: Face, tube = 0.0065) =>
  onFace(face, arc(0.034, tube, 2, Math.PI / 2).translate(0, -0.034, 0), 0, -0.43, 0.009)

const facialHair: Record<Exclude<Avatar['facial_hair'], 'none'>, (face: Face) => BufferGeometry> = {
  stubble: (face) => shell(face, { grow: 0.012, keep: beardArea }),
  mustache: (face) => mustache(face),
  goatee: (face) =>
    merge(
      mustache(face, 0.005),
      shell(face, {
        grow: 0.035,
        keep: (p) => Math.abs(p.x) < 0.42 && p.y < -0.42 && p.z > 0.45 && !mouthArea(p),
        swell: (p) => 1 + smoothstep(-0.6, -1, p.y),
      }),
    ),
  'short-beard': (face) =>
    merge(
      mustache(face, 0.0055),
      shell(face, {
        grow: 0.035,
        keep: beardArea,
        swell: (p) => 1 + 0.6 * smoothstep(-0.6, -1, p.y),
      }),
    ),
  'full-beard': (face) =>
    merge(
      mustache(face, 0.0075),
      shell(face, {
        grow: 0.07,
        keep: beardArea,
        swell: (p) => 1 + 1.4 * smoothstep(-0.55, -1, p.y),
      }),
    ),
}

function frames(face: Face, kind: Exclude<Avatar['glasses'], 'none'>) {
  const parts: BufferGeometry[] = []
  const front = facePoint(face, eyeSpread, eyeLevel).z + 0.017
  const lens = (x: number) => {
    const y = headCenter.y + eyeLevel * headRadii.y
    if (kind === 'square') {
      return [
        [0, 0.018, 0.058, 0.0045],
        [0, -0.018, 0.058, 0.0045],
        [0.027, 0, 0.0045, 0.04],
        [-0.027, 0, 0.0045, 0.04],
      ].map(([dx, dy, w, h]) =>
        new RoundedBoxGeometry(w!, h!, 0.004, 1, 0.0015).translate(x + dx!, y + dy!, front),
      )
    }
    const rim = new TorusGeometry(0.026, 0.0028, 6, 24).translate(x, y, front)
    return kind === 'sunglasses'
      ? [
          rim,
          new CylinderGeometry(0.026, 0.026, 0.002, 24).rotateX(Math.PI / 2).translate(x, y, front),
        ]
      : [rim]
  }
  const x = facePoint(face, eyeSpread, eyeLevel).x
  parts.push(...lens(-x), ...lens(x))
  const y = headCenter.y + eyeLevel * headRadii.y + 0.006
  parts.push(new RoundedBoxGeometry(2 * x - 0.054, 0.004, 0.004, 1, 0.0015).translate(0, y, front))
  return merge(...parts)
}

const bubble = () =>
  merge(
    new RoundedBoxGeometry(0.36, 0.24, 0.05, 2, 0.05).translate(0.3, 1.42, 0),
    new ConeGeometry(0.035, 0.09, 4).rotateZ(-0.6).translate(0.19, 1.3, 0),
  )

const dots = () =>
  merge(
    ...[0.22, 0.3, 0.38].map((x) => ellipsoid(0.022, 0.022, 0.012, 10).translate(x, 1.42, 0.03)),
  )

const blobs = {
  head: () => ellipsoid(0.1, 0.13, 0.11, 8).translate(0, 1.04, 0),
  hair: () =>
    new SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2)
      .scale(0.106, 0.1, 0.116)
      .translate(0, 1.07, -0.005),
  torso: () =>
    merge(
      new CylinderGeometry(0.13, 0.11, 0.36, 8).scale(1, 1, 0.65).translate(0, 0.73, 0),
      ...[-1, 1].map((side) =>
        new CylinderGeometry(0.04, 0.032, 0.48, 6).translate(side * 0.15, 0.62, 0),
      ),
    ),
  legs: () =>
    merge(
      ...[-1, 1].map((side) =>
        new CylinderGeometry(0.055, 0.04, 0.56, 6).translate(side * 0.062, 0.28, 0),
      ),
    ),
}

const builders: Record<string, (...args: string[]) => BufferGeometry> = {
  blob: (part) => blobs[part as keyof typeof blobs](),
  head: (face) => head(face as Face),
  neck: (build) => neck(build as Build),
  eyes: (face, eye, piece) =>
    eyes(face as Face, eye as Avatar['eye_shape'], piece as keyof typeof eyePieces),
  brows: (face, weight) => brows(face as Face, weight as Avatar['brows']),
  cheeks: (face) => cheeks(face as Face),
  nose: (face, kind) => nose(face as Face, kind as Avatar['nose']),
  lips: (face, weight) => lips(face as Face, weight as Avatar['lips']),
  hair: (face, style) => hairStyles[style as Avatar['hair_style']]!(face as Face),
  facial: (face, kind) => facialHair[kind as keyof typeof facialHair](face as Face),
  glasses: (face, kind) => frames(face as Face, kind as Exclude<Avatar['glasses'], 'none'>),
  torso: (build) => torso(build as Build),
  top: (style, piece, build) =>
    (
      tops[style as Avatar['top_style']] as Partial<
        Record<string, (build: Build) => BufferGeometry>
      >
    )[piece]!(build as Build),
  hips: (build) => hips(build as Build),
  skirt: (build) => skirt(build as Build),
  limb: (kind, build) => limb(limbs[kind as keyof typeof limbs], build as Build),
  hand: () =>
    merge(
      ellipsoid(0.021, 0.04, 0.03).translate(0, -0.255, 0),
      ellipsoid(0.009, 0.02, 0.009).rotateX(0.4).translate(0, -0.235, 0.022),
    ),
  shoe: () => new RoundedBoxGeometry(0.074, 0.058, 0.155, 3, 0.024).translate(0, -0.278, 0.03),
  bubble,
  dots,
  vehicle: () => new RoundedBoxGeometry(1.3, 0.45, 2, 2, 0.1).translate(0, -0.1, 0),
}

export const hasTrim = (style: Avatar['top_style'], piece: 'trim' | 'inner') => piece in tops[style]
export const hasHair = (style: Avatar['hair_style']) => hairStyles[style] !== null

const cache = new Map<string, BufferGeometry>()

export function shape(id: string): BufferGeometry {
  let geometry = cache.get(id)
  if (!geometry) {
    const [kind, ...args] = id.split(':')
    geometry = builders[kind!]!(...args)
    cache.set(id, geometry)
  }
  return geometry
}
