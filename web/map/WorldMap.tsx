import { Canvas } from '@react-three/fiber'
import { useWorld } from '../api'
import { Camera, PixelPass } from './camera'
import { People } from './people'
import { Places } from './places'
import { Sky } from './sky'
import { Terrain } from './terrain'

const sanFrancisco = { x: 90, y: 100 }

export default function WorldMap() {
  const world = useWorld()
  return (
    <div className="map">
      <Canvas
        orthographic
        dpr={[1, 1.5]}
        gl={{ antialias: false }}
        camera={{ zoom: 10, near: 0.1, far: 2000 }}
      >
        <Sky center={sanFrancisco} />
        <Terrain />
        <Places />
        {world.data && (
          <People people={world.data.snapshot.people} serverOffsetMs={world.data.serverOffsetMs} />
        )}
        <Camera target={sanFrancisco} />
        <PixelPass pixelSize={3} />
      </Canvas>
    </div>
  )
}
