import { Canvas } from '@react-three/fiber'
import { useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { Mesh, type Object3D } from 'three'
import { useWorld } from '../api'
import { useMusic } from '../music'
import { Ambient } from './ambient'
import { Buildings } from './buildings'
import { Camera, VisibleArea, zoomBy, type Focus } from './camera'
import { PixelPass } from './pixel'
import { buildCity } from './city'
import { Decor } from './decor'
import { Ground } from './ground'
import { Labels } from './labels'
import { Landmarks } from './landmarks'
import { People } from './people'
import { PersonHover } from './PersonHover'
import { Places } from './places'
import { Sky } from './sky'
import { Skyloop } from './skyloop'
import { Marks, Snores, Talks } from './talks'
import { Traffic } from './traffic'
import { Trees } from './trees'
import { tour, touring, watched } from './watching'
import { Water } from './water'
import { Wonders } from './wonders'

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
  const watching = useSyncExternalStore(watched.subscribe, watched.get)
  const onTour = useSyncExternalStore(touring.subscribe, touring.get)
  const music = useMusic()
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
        <Skyloop />
        <Decor city={city} />
        <Places />
        <Traffic />
        <Wonders />
        {world.data && (
          <>
            <People
              people={world.data.snapshot.people}
              serverOffsetMs={world.data.serverOffsetMs}
              onSelect={select}
            />
            <Talks onOpen={read} />
            <Snores />
            <Marks />
            <Ambient people={world.data.snapshot.people} />
            <Labels
              people={world.data.snapshot.people}
              serverOffsetMs={world.data.serverOffsetMs}
            />
          </>
        )}
        <Camera focus={view} />
        <PixelPass />
      </Canvas>
      <PersonHover />
      <div className="dock">
        {watching && (
          <button type="button" className="watching" onClick={() => watched.set(null)}>
            Watching {watching.name}
            <b>Stop</b>
          </button>
        )}
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
          <div className="extras">
            <button
              type="button"
              aria-pressed={onTour}
              aria-label={onTour ? 'Stop the tour' : 'Start a tour'}
              title="Glide between conversations and busy places"
              onClick={() => tour(!onTour)}
            >
              {onTour ? '■' : '▶'}
            </button>
            <span>Tour</span>
          </div>
          <div className="extras">
            <button
              type="button"
              className={music.muted ? 'off' : undefined}
              aria-pressed={!music.muted}
              aria-label={music.muted ? 'Turn the music on' : 'Mute the music'}
              title={music.muted ? 'Turn the music on' : 'Mute the music'}
              onClick={music.toggle}
            >
              ♪
            </button>
            <span>Music</span>
          </div>
        </div>
      </div>
    </div>
  )
}
