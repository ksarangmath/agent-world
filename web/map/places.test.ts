import { expect, test } from 'vitest'
import { places } from '../../shared/map/places'
import { spots } from '../../shared/map/spots'
import { propsOf } from './places'

test("nothing tall and bulky stands on anybody's spot", () => {
  for (const place of places) {
    const centers = spots(place).map((spot) => ({ x: spot.x + 0.5, z: spot.y + 0.5 }))
    for (const prop of propsOf(place)) {
      const [width, height, depth] = prop.size
      if (height < 0.5 || Math.min(width, depth) < 0.3) continue
      const [cos, sin] = [Math.cos(prop.yaw), Math.sin(prop.yaw)]
      const covered = centers.filter((center) => {
        const [dx, dz] = [center.x - prop.x, center.z - prop.z]
        const [across, along] = [dx * cos - dz * sin, dx * sin + dz * cos]
        return Math.abs(across) < width / 2 + 0.15 && Math.abs(along) < depth / 2 + 0.15
      })
      expect(covered, `${place.id}: a ${width.toFixed(2)} by ${depth.toFixed(2)} prop`).toEqual([])
    }
  }
})
