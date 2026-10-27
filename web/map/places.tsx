import { useLayoutEffect, useRef } from 'react'
import { Color, Object3D, type InstancedMesh } from 'three'
import { places, type Activity } from '../../shared/map/places'

const activityColors: Record<Activity, string> = {
  coding: '#5b6ee1',
  coffee: '#8b5a3c',
  reading: '#c9a227',
  music: '#d9488f',
  art: '#e8743b',
  climbing: '#7a8b99',
  running: '#3fa66b',
  hiking: '#2f7d4f',
  surfing: '#2aa3c9',
  sailing: '#f2f2f2',
  tinkering: '#b0413e',
  eating: '#e0b04a',
  chatting: '#9b6bd1',
  picnic: '#7bc96f',
  chess: '#444444',
  pitching: '#1f3a5f',
}

export function Places() {
  const buildings = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = buildings.current
    if (!mesh) return
    const dummy = new Object3D()
    places.forEach((place, i) => {
      const height = 1.5 + (place.capacity % 4)
      dummy.position.set(place.x + place.width / 2, height / 2, place.y - 0.5)
      dummy.scale.set(place.width, height, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, new Color(activityColors[place.activity]))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [])
  return (
    <instancedMesh ref={buildings} args={[undefined, undefined, places.length]} castShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshLambertMaterial />
    </instancedMesh>
  )
}
