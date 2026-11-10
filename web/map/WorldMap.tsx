import { Canvas } from '@react-three/fiber'
import { useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Mesh, type Object3D } from 'three'
import { useWorld } from '../api'
import { Buildings } from './buildings'
import { Camera, VisibleArea, zoomBy, type Focus } from './camera'
import { PixelPass } from './pixel'
import { buildCity } from './city'
import { Crowds } from './crowds'
import { Decor } from './decor'
import { Ground } from './ground'
import { Labels } from './labels'
import { Landmarks } from './landmarks'
import { People } from './people'
import { PersonHover } from './PersonHover'
import { Places } from './places'
import { Sky } from './sky'
import { Talks } from './talks'
import { Traffic } from './traffic'
import { Trees } from './trees'
import { Water } from './water'

const sanFrancisco: Focus = { x: 205, y: 225, zoom: 4.5 }

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
  const navigate = useNavigate()
  const select = useCallback(
    (personId: string) =>
      void navigate({ to: '/people/$personId', params: { personId }, search: true }),
    [navigate],
  )
  const read = useCallback(
    (conversationId: string) =>
      void navigate({
        to: '/conversations/$conversationId',
        params: { conversationId },
        search: true,
      }),
    [navigate],
  )
  useEffect(() => () => scene.current?.traverse(release), [])
  return (
    <div className="map">
      <Canvas
        orthographic
        frameloop="never"
        dpr={1}
        shadows="percentage"
        gl={{ antialias: false }}
        camera={{ near: 1, far: 4000 }}
        onCreated={(state) => {
          scene.current = state.scene
        }}
      >
        <Sky />
        <VisibleArea />
        <Ground pixels={city.pixels} />
        <Water />
        <Buildings buildings={city.buildings} />
        <Trees trees={city.trees} />
        <Landmarks />
        <Decor city={city} />
        <Places />
        <Traffic />
        {world.data && (
          <>
            <People
              people={world.data.snapshot.people}
              serverOffsetMs={world.data.serverOffsetMs}
              onSelect={select}
            />
            <Crowds />
            <Talks onOpen={read} />
            <Labels />
          </>
        )}
        <Camera focus={view} />
        <PixelPass />
      </Canvas>
      <PersonHover />
      <div className="controls">
        <div className="move">
          <kbd>↑</kbd>
          <kbd>←</kbd>
          <kbd>↓</kbd>
          <kbd>→</kbd>
          <span>
            Move
            <br />
            or WASD
          </span>
        </div>
        <div className="zoom">
          <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1.6)}>
            +
          </button>
          <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.6)}>
            −
          </button>
          <span>
            Zoom
            <br />
            or scroll
          </span>
        </div>
      </div>
    </div>
  )
}
