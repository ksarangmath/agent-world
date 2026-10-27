import { Canvas } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Mesh, type Object3D } from 'three'
import { useWorld } from '../api'
import { Buildings } from './buildings'
import { Camera, PixelPass, VisibleArea, type Focus } from './camera'
import { buildCity } from './city'
import { Ground } from './ground'
import { Labels } from './labels'
import { Landmarks } from './landmarks'
import { People } from './people'
import { Places } from './places'
import { Sky } from './sky'
import { Traffic } from './traffic'
import { Trees } from './trees'
import { Water } from './water'

const sanFrancisco: Focus = { x: 450, y: 420, zoom: 10 }

function release(object: Object3D) {
  if (!(object instanceof Mesh)) return
  object.geometry.dispose()
  for (const material of [object.material].flat()) material.dispose()
}

export default function WorldMap({ focus }: { focus: Partial<Focus> }) {
  const world = useWorld()
  const city = useMemo(() => buildCity(), [])
  const view = { ...sanFrancisco, ...focus }
  const scene = useRef<Object3D | null>(null)
  useEffect(() => () => scene.current?.traverse(release), [])
  return (
    <div className="map">
      <Canvas
        orthographic
        dpr={[1, 1.5]}
        gl={{ antialias: false }}
        camera={{ near: 1, far: 4000 }}
        onCreated={(state) => {
          scene.current = state.scene
        }}
      >
        <Sky center={view} />
        <VisibleArea />
        <Ground pixels={city.pixels} />
        <Water />
        <Buildings buildings={city.buildings} />
        <Trees trees={city.trees} />
        <Landmarks />
        <Places />
        <Traffic />
        {world.data && (
          <>
            <People
              people={world.data.snapshot.people}
              serverOffsetMs={world.data.serverOffsetMs}
            />
            <Labels people={world.data.snapshot.people} />
          </>
        )}
        <Camera focus={view} />
        <PixelPass pixelSize={3} />
      </Canvas>
    </div>
  )
}
