import { metros, type Metro } from '../metros'
import * as austin from './austin/places'
import * as bay from './bay/places'
import { warps } from './grid'
import type { Tile } from './route'

export const regionNames = { ...bay.regionNames, ...austin.regionNames }

export const regionNamesIn: Record<Metro, readonly string[]> = {
  bay: Object.values(bay.regionNames),
  austin: Object.values(austin.regionNames),
}
export type Region = keyof typeof regionNames

export const activities = [
  'coding',
  'coffee',
  'reading',
  'music',
  'art',
  'climbing',
  'running',
  'hiking',
  'surfing',
  'sailing',
  'tinkering',
  'eating',
  'chatting',
  'picnic',
  'chess',
  'pitching',
  'comedy',
  'karaoke',
  'games',
  'rallying',
  'swimming',
  'skating',
  'dogs',
  'flying',
  'camping',
  'yoga',
  'dancing',
  'gardening',
  'cooking',
  'fishing',
  'stargazing',
  'pottery',
  'birding',
] as const
export type Activity = (typeof activities)[number]

export type Place = {
  id: string
  name: string
  metro: Metro
  region: Region
  neighborhood: string
  description: string
  tags: string[]
  activity: Activity
  center: Tile
  capacity: number
}

export type Row = [
  id: string,
  name: string,
  neighborhood: string,
  activity: Activity,
  at: [lat: number, lon: number],
  capacity: number,
  tags: string[],
  description: string,
]

const rows: Record<Metro, Partial<Record<Region, Row[]>>> = { bay: bay.rows, austin: austin.rows }

const placesByMetro = Object.fromEntries(
  metros.map((metro) => [
    metro,
    Object.entries(rows[metro]).flatMap(([region, list]) =>
      list.map(
        ([id, name, neighborhood, activity, [lat, lon], capacity, tags, description]): Place => {
          const [x, y] = warps[metro](lon, lat)
          return {
            id,
            name,
            metro,
            region: region as Region,
            neighborhood,
            description,
            tags,
            activity,
            center: { x: Math.round(x), y: Math.round(y) },
            capacity,
          }
        },
      ),
    ),
  ]),
) as Record<Metro, Place[]>

export const placesIn = (metro: Metro): Place[] => placesByMetro[metro]

export const places: Place[] = metros.flatMap(placesIn)

export const placesById: ReadonlyMap<string, Place> = new Map(
  places.map((place) => [place.id, place]),
)
