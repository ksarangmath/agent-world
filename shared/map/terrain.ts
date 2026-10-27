import geography from './geography.json'
import { groundKinds, mapHeight, mapWidth, type GroundKind } from './grid'

function decode(rows: number[][]): Uint8Array {
  const grid = new Uint8Array(mapWidth * mapHeight)
  rows.forEach((row, y) => {
    let x = y * mapWidth
    for (let i = 0; i < row.length; i += 2) {
      grid.fill(row[i]!, x, x + row[i + 1]!)
      x += row[i + 1]!
    }
  })
  return grid
}

export const ground: Uint8Array = decode(geography.ground)

export const groundAt = (x: number, y: number): GroundKind =>
  groundKinds[ground[y * mapWidth + x]!]!

export const isDry = (kind: GroundKind) => kind !== 'ocean' && kind !== 'water'
