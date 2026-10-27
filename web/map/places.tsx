import { useLayoutEffect, useMemo, useRef } from 'react'
import { BoxGeometry, Color, Object3D, type InstancedMesh } from 'three'
import { places, type Place } from '../../shared/map/places'
import { spots } from '../../shared/map/spots'
import { hash, surfaceAt } from './elevation'

type Prop = {
  x: number
  z: number
  y: number
  size: [number, number, number]
  color: string
  yaw: number
}

const box = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0)
const propScale = 1.7
const bright = ['#e8524a', '#f2b632', '#4aa3df', '#5fbf6b', '#b06ad9', '#f28c38']

function propsOf(place: Place): Prop[] {
  const props: Prop[] = []
  spots(place).forEach((spot, i) => {
    const [cx, cz] = [spot.x + 0.5, spot.y + 0.5]
    const [dx, dz] = [place.center.x - spot.x, place.center.y - spot.y]
    const length = Math.sqrt(dx * dx + dz * dz) || 1
    const [ux, uz] = length > 0.5 ? [dx / length, dz / length] : [0, 1]
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
    ) =>
      props.push({
        x: cx + (ux * forward + uz * side) * propScale,
        z: cz + (uz * forward - ux * side) * propScale,
        y: ground + lift * propScale,
        size: [size[0] * propScale, size[1] * propScale, size[2] * propScale],
        color: tint,
        yaw,
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
        if (i % 2 === 0) {
          add(0.26, 0.26, [0.03, 0.5, 0.03], '#d0d0d0')
          add(0.26, 0.74, [0.6, 0.06, 0.6], i % 4 === 0 ? '#d9534f' : '#3a9a8a')
        }
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
        add(0, 0, [1, 0.1, 1], '#4a3a2e')
        if (i === 0) {
          add(0.6, 0.1, [0.25, 0.55, 0.25], '#1d1d22', 0.5)
          add(0.6, 0.1, [0.25, 0.55, 0.25], '#1d1d22', -0.5)
        }
        break
      case 'pitching':
        add(0, 0, [1, 0.14, 1], '#2d3a4a')
        if (i === 0) add(0.8, 0.14, [1.4, 0.8, 0.06], '#6fb3ff')
        break
      case 'art':
        add(0.3, 0, [0.04, 0.5, 0.04], '#8a6a46')
        add(0.3, 0.22, [0.34, 0.27, 0.03], color)
        break
      case 'climbing':
        add(0.45, 0, [0.95, 1.8, 0.12], '#8a9aa8')
        for (let hold = 0; hold < 4; hold++) {
          add(
            0.38,
            0.25 + hold * 0.38,
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
        add(0.2, 0, [0.12, 0.75, 0.035], color, 0.3)
        break
      case 'sailing':
        add(0, -0.02, [1, 0.08, 1], '#a88a6a')
        add(0.45, 0, [0.07, 0.3, 0.07], '#6b4f36', 0.45)
        break
      case 'tinkering':
        add(0.3, 0, [0.55, 0.26, 0.28], '#8b5a2b')
        add(0.3, 0.26, [0.13, 0.13, 0.13], '#9aa3ad')
        add(0.3, 0.39, [0.08, 0.07, 0.08], '#c7cdd3')
        break
      case 'chatting':
        add(0.3, 0, [0.45, 0.12, 0.16], '#7a5a3a')
        break
    }
  })
  return props
}

export function Places() {
  const mesh = useRef<InstancedMesh>(null)
  const props = useMemo(() => places.flatMap(propsOf), [])
  useLayoutEffect(() => {
    const dummy = new Object3D()
    const color = new Color()
    props.forEach((prop, i) => {
      dummy.position.set(prop.x, prop.y, prop.z)
      dummy.rotation.set(0, prop.yaw, 0)
      dummy.scale.set(...prop.size)
      dummy.updateMatrix()
      mesh.current!.setMatrixAt(i, dummy.matrix)
      mesh.current!.setColorAt(i, color.set(prop.color))
    })
    mesh.current!.instanceMatrix.needsUpdate = true
    if (mesh.current!.instanceColor) mesh.current!.instanceColor.needsUpdate = true
    mesh.current!.computeBoundingSphere()
  }, [props])
  return (
    <instancedMesh ref={mesh} args={[box, undefined, props.length]}>
      <meshLambertMaterial />
    </instancedMesh>
  )
}
