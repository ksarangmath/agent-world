import type { Metro } from '../metros'
import austinGeography from './austin/geography.json'
import { transit as austinTransit } from './austin/transit'
import bayGeography from './bay/geography.json'
import { transit as bayTransit } from './bay/transit'
import { groundKinds, mapWidth, warps, type GroundKind } from './grid'
import { placesIn } from './places'
import { buildRoads, buildRouter, type RoadLines, type Transit } from './route'
import { claimSpots } from './spots'
import { decode, isDry } from './terrain'

export type Geography = {
  ground: number[][]
  roads: RoadLines
  named: Record<string, number[][]>
}

const sources: Record<Metro, { geography: Geography; transit: Transit }> = {
  bay: { geography: bayGeography, transit: bayTransit },
  austin: { geography: austinGeography, transit: austinTransit },
}

function build(metro: Metro) {
  const { geography, transit } = sources[metro]
  const warp = warps[metro]
  const places = placesIn(metro)
  const ground = decode(geography.ground)
  const groundAt = (x: number, y: number): GroundKind => groundKinds[ground[y * mapWidth + x]!]!
  const { roadLines, roads } = buildRoads(geography.roads)
  const router = buildRouter(roads, warp, transit)
  const spots = claimSpots(
    places,
    (tile) => isDry(groundAt(tile.x, tile.y)) && !roads[tile.y * mapWidth + tile.x],
  )
  return {
    metro,
    warp,
    places,
    ground,
    groundAt,
    roadLines,
    roads,
    named: geography.named,
    spots,
    ...router,
  }
}

export type Atlas = ReturnType<typeof build>

const built = new Map<Metro, Atlas>()

export function atlasOf(metro: Metro): Atlas {
  const known = built.get(metro)
  if (known) return known
  const atlas = build(metro)
  built.set(metro, atlas)
  return atlas
}
