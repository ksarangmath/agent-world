import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  BufferGeometry,
  Matrix4,
  Object3D,
  SphereGeometry,
  Vector3,
} from 'three'

function gable() {
  const geometry = new BufferGeometry()
  const [l, r, f, b] = [-0.5, 0.5, 0.5, -0.5]
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute(
      [
        [l, 0, f, r, 0, f, 0, 1, f],
        [r, 0, b, l, 0, b, 0, 1, b],
        [l, 0, b, l, 0, f, 0, 1, f, l, 0, b, 0, 1, f, 0, 1, b],
        [r, 0, f, r, 0, b, 0, 1, b, r, 0, f, 0, 1, b, 0, 1, f],
      ].flat(),
      3,
    ),
  )
  geometry.computeVertexNormals()
  return geometry
}

export const shapes = {
  box: new BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  cylinder: new CylinderGeometry(0.5, 0.5, 1, 8).translate(0, 0.5, 0),
  taper: new CylinderGeometry(0.4, 0.5, 1, 8).translate(0, 0.5, 0),
  pyramid: new ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0),
  cone: new ConeGeometry(0.5, 1, 8).translate(0, 0.5, 0),
  dome: new SphereGeometry(0.5, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 2, 1),
  gable: gable(),
}

export type Shape = keyof typeof shapes
export type Point = readonly [x: number, y: number, z: number]
export type Part = { shape: Shape; matrix: Matrix4; color: string }
export type Light = { position: Point; color: string; blink?: number; shimmer?: number }

const dummy = new Object3D()
const target = new Vector3()
const centered = new Matrix4().makeTranslation(0, -0.5, 0)

export function solid(
  shape: Shape,
  color: string,
  [x, y, z]: Point,
  [width, height, depth]: Point,
  yaw = 0,
): Part {
  dummy.position.set(x, y, z)
  dummy.rotation.set(0, yaw, 0)
  dummy.scale.set(width, height, depth)
  dummy.updateMatrix()
  return { shape, color, matrix: dummy.matrix.clone() }
}

export function beam(
  color: string,
  [ax, ay, az]: Point,
  [bx, by, bz]: Point,
  thickness: number,
): Part {
  dummy.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2)
  dummy.rotation.set(0, 0, 0)
  dummy.lookAt(target.set(bx, by, bz))
  dummy.scale.set(thickness, thickness, Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2 + (bz - az) ** 2))
  dummy.updateMatrix()
  dummy.matrix.multiply(centered)
  return { shape: 'box', color, matrix: dummy.matrix.clone() }
}
