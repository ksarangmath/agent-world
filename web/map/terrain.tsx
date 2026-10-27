import { useMemo } from 'react'
import { DataTexture, NearestFilter, RGBAFormat, SRGBColorSpace } from 'three'
import { mapHeight, mapWidth } from '../../shared/map/route'
import { terrain, tileKinds, type TileKind } from '../../shared/map/terrain'

const colors: Record<TileKind, [number, number, number]> = {
  water: [64, 132, 196],
  land: [214, 200, 160],
  park: [104, 168, 84],
  sand: [236, 218, 160],
  road: [120, 116, 112],
  bridge: [196, 84, 60],
}

function terrainTexture() {
  const pixels = new Uint8Array(mapWidth * mapHeight * 4)
  terrain.forEach((kind, i) => {
    const [x, y] = [i % mapWidth, Math.floor(i / mapWidth)]
    const [r, g, b] = colors[tileKinds[kind]!]
    pixels.set([r, g, b, 255], ((mapHeight - 1 - y) * mapWidth + x) * 4)
  })
  const texture = new DataTexture(pixels, mapWidth, mapHeight, RGBAFormat)
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

export function Terrain() {
  const texture = useMemo(() => terrainTexture(), [])
  const [r, g, b] = colors.water
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[mapWidth / 2, -0.05, mapHeight / 2]}>
        <planeGeometry args={[mapWidth * 8, mapHeight * 8]} />
        <meshLambertMaterial color={`rgb(${r}, ${g}, ${b})`} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[mapWidth / 2, 0, mapHeight / 2]}>
        <planeGeometry args={[mapWidth, mapHeight]} />
        <meshLambertMaterial map={texture} />
      </mesh>
    </>
  )
}
