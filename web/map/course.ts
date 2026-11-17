import { groundAt } from './atlas'

type Spot = [x: number, z: number]

export function downstream([x, z]: Spot, tiles: number): Spot[] {
  const wet = (tx: number, tz: number) => groundAt(Math.floor(tx), Math.floor(tz)) === 'water'
  const course: Spot[] = [[x, z]]
  for (let step = 3; step <= tiles; step += 3) {
    const column = x + step
    const reach = Array.from({ length: 25 }, (_, k) => z + (k % 2 ? (k + 1) / 2 : -k / 2))
    const near = reach.find((row) => wet(column, row))
    if (near === undefined) break
    let [top, bottom] = [near, near]
    while (wet(column, top - 1)) top--
    while (wet(column, bottom + 1)) bottom++
    z = (top + bottom) / 2
    course.push([column + 0.5, z + 0.5])
  }
  return course
}
