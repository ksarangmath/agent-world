import { mapHeight, mapWidth, warp } from '../../../shared/map/grid'
import { heightAt, shoreHeight } from '../elevation'
import { wetAt } from './bridges'
import { beam, solid, type Light, type Part, type Point } from './shapes'

type Site = { x: number; y: number; ground: number }

export const windmillSite = site(-122.5094, 37.7705)

function site(lon: number, lat: number): Site {
  const [x, y] = warp(lon, lat)
  return { x, y, ground: Math.max(heightAt(x, y), shoreHeight) }
}

function reserve(tiles: Set<number>, x: number, y: number, radius: number) {
  for (let ty = Math.floor(y - radius); ty <= Math.ceil(y + radius); ty++) {
    for (let tx = Math.floor(x - radius); tx <= Math.ceil(x + radius); tx++) {
      const inside = (tx + 0.5 - x) ** 2 + (ty + 0.5 - y) ** 2 <= radius * radius
      if (inside && tx >= 0 && ty >= 0 && tx < mapWidth && ty < mapHeight)
        tiles.add(ty * mapWidth + tx)
    }
  }
}

const angleBetween = (a: [number, number], b: [number, number]) => {
  const [ax, ay] = warp(...a)
  const [bx, by] = warp(...b)
  return Math.atan2(bx - ax, by - ay)
}

const offset = (s: Site, yaw: number, along: number, across = 0, up = 0): Point => [
  s.x + Math.sin(yaw) * along + Math.cos(yaw) * across,
  s.ground + up,
  s.y + Math.cos(yaw) * along - Math.sin(yaw) * across,
]

export function icons() {
  const parts: Part[] = []
  const lights: Light[] = []
  const reserved = new Set<number>()
  const add = (s: Site, radius: number) => reserve(reserved, s.x, s.y, radius)

  const pyramid = site(-122.4028, 37.7952)
  add(pyramid, 3)
  parts.push(solid('pyramid', '#f1f0eb', [pyramid.x, pyramid.ground, pyramid.y], [3, 22, 3]))
  for (const across of [-0.85, 0.85]) {
    parts.push(
      solid(
        'box',
        '#e2e0da',
        [pyramid.x + across, pyramid.ground + 12.5, pyramid.y],
        [0.4, 4, 0.7],
      ),
    )
  }
  parts.push(
    solid('cone', '#d9d7d0', [pyramid.x, pyramid.ground + 21.5, pyramid.y], [0.2, 3.5, 0.2]),
  )
  lights.push({
    position: [pyramid.x, pyramid.ground + 25.1, pyramid.y],
    color: '#ff3b2f',
    blink: 1,
  })

  const roundTop = site(-122.3966, 37.7898)
  add(roundTop, 3)
  parts.push(solid('taper', '#c3cdd6', [roundTop.x, roundTop.ground, roundTop.y], [3, 30, 3]))
  parts.push(
    solid('dome', '#dfe5ea', [roundTop.x, roundTop.ground + 30, roundTop.y], [2.4, 1.3, 2.4]),
  )
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2
    lights.push({
      position: [
        roundTop.x + Math.sin(angle) * 1.2,
        roundTop.ground + 30.6,
        roundTop.y + Math.cos(angle) * 1.2,
      ],
      color: '#bfe3ff',
      shimmer: i,
    })
  }

  const coit = site(-122.4058, 37.8024)
  add(coit, 2.2)
  parts.push(solid('box', '#ece5d2', [coit.x, coit.ground - 0.2, coit.y], [1.8, 0.8, 1.8]))
  parts.push(solid('cylinder', '#f7f3ea', [coit.x, coit.ground + 0.5, coit.y], [0.85, 5, 0.85]))
  parts.push(solid('cylinder', '#ebe4d2', [coit.x, coit.ground + 5.4, coit.y], [1, 0.4, 1]))
  lights.push({ position: [coit.x, coit.ground + 5.9, coit.y], color: '#ffe2a8' })

  const ferry = site(-122.3937, 37.7955)
  const shoreline = angleBetween([-122.3955, 37.7978], [-122.3918, 37.7932])
  for (let along = -3.2; along <= 3.2; along += 0.8)
    reserve(reserved, ...xy(offset(ferry, shoreline, along)), 1)
  parts.push(
    solid('box', '#e6d8bd', offset(ferry, shoreline, 0, 0, -0.2), [1.4, 1.3, 6.6], shoreline),
  )
  parts.push(
    solid('box', '#b9ac93', offset(ferry, shoreline, 0, 0, 1.1), [1.2, 0.15, 6.4], shoreline),
  )
  parts.push(
    solid('box', '#ede1c8', offset(ferry, shoreline, 0, 0, -0.2), [0.85, 6.4, 0.85], shoreline),
  )
  parts.push(
    solid('pyramid', '#c9bda3', offset(ferry, shoreline, 0, 0, 6.2), [0.9, 1.6, 0.9], shoreline),
  )
  for (const face of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    lights.push({ position: offset(ferry, shoreline + face, 0.45, 0, 5.4), color: '#fff3d0' })
  }

  const cityHall = site(-122.4193, 37.7793)
  add(cityHall, 3)
  parts.push(
    solid('box', '#ece7da', [cityHall.x, cityHall.ground - 0.2, cityHall.y], [5.2, 2.2, 3]),
  )
  parts.push(
    solid('cylinder', '#e4dfd0', [cityHall.x, cityHall.ground + 2, cityHall.y], [2.2, 1.5, 2.2]),
  )
  parts.push(
    solid('dome', '#c9b064', [cityHall.x, cityHall.ground + 3.5, cityHall.y], [2.4, 1.3, 2.4]),
  )
  parts.push(
    solid(
      'cylinder',
      '#c9b064',
      [cityHall.x, cityHall.ground + 5.9, cityHall.y],
      [0.45, 0.6, 0.45],
    ),
  )
  parts.push(
    solid('cone', '#c9b064', [cityHall.x, cityHall.ground + 6.5, cityHall.y], [0.35, 0.9, 0.35]),
  )

  const sutro = site(-122.4528, 37.7552)
  add(sutro, 1.5)
  const legs = [0, 1, 2].map((i) => (i / 3) * Math.PI * 2 + Math.PI / 2)
  const around = (radius: number, up: number, angle: number): Point => [
    sutro.x + Math.cos(angle) * radius,
    sutro.ground + up,
    sutro.y + Math.sin(angle) * radius,
  ]
  const stripes = ['#c8352b', '#f4f1ea']
  for (const angle of legs) {
    const levels: [number, number][] = [
      [1.5, 0],
      [1.15, 2],
      [0.8, 4],
      [0.45, 6],
      [0.35, 8],
      [0.65, 10.2],
      [1, 12.6],
    ]
    levels.slice(1).forEach(([radius, up], i) => {
      const [fromRadius, fromUp] = levels[i]!
      parts.push(
        beam(stripes[i % 2]!, around(fromRadius, fromUp, angle), around(radius, up, angle), 0.3),
      )
    })
    lights.push({ position: around(1, 12.9, angle), color: '#ff3b2f', blink: 1 })
  }
  for (const [radius, up] of [
    [0.8, 4],
    [0.35, 8],
    [0.65, 10.2],
    [1, 12.6],
  ] as const) {
    legs.forEach((angle, i) => {
      parts.push(
        beam('#f4f1ea', around(radius, up, angle), around(radius, up, legs[(i + 1) % 3]!), 0.18),
      )
    })
  }

  const palace = site(-122.4484, 37.8029)
  add(palace, 3.4)
  parts.push(solid('cylinder', '#d4a77c', [palace.x, palace.ground, palace.y], [2, 1.7, 2]))
  parts.push(solid('dome', '#c48a5f', [palace.x, palace.ground + 1.7, palace.y], [2.2, 0.8, 2.2]))
  parts.push(
    solid(
      'cylinder',
      '#4f97b8',
      [palace.x + 2.6, palace.ground - 0.02, palace.y + 0.4],
      [3.2, 0.06, 2.6],
    ),
  )
  for (let i = 0; i < 11; i++) {
    const angle = Math.PI * (0.35 + (i / 10) * 1.1)
    parts.push(
      solid(
        'cylinder',
        '#dcb48c',
        [palace.x + Math.cos(angle) * 2.8, palace.ground, palace.y + Math.sin(angle) * 2.8],
        [0.28, 1.5, 0.28],
      ),
    )
  }

  const ladies = site(-122.433, 37.7762)
  const ladyColors = [
    ['#e98fa8', '#7d3a52'],
    ['#7fb8de', '#2f5778'],
    ['#f0d070', '#8a6a24'],
    ['#9cd08e', '#3e6b38'],
    ['#f2a46e', '#8a4a26'],
    ['#b39ae0', '#4f3c7a'],
    ['#f08f86', '#7a3530'],
  ]
  ladyColors.forEach(([wall, roof], i) => {
    const house = { ...ladies, y: ladies.y - 2.6 + i * 0.85 }
    const ground = Math.max(heightAt(house.x, house.y), shoreHeight)
    reserve(reserved, house.x, house.y, 0.7)
    parts.push(solid('box', wall!, [house.x, ground - 0.2, house.y], [1.1, 2.2, 0.82]))
    parts.push(solid('box', '#fbf7ee', [house.x - 0.58, ground + 0.3, house.y], [0.12, 1.3, 0.5]))
    parts.push(solid('gable', roof!, [house.x, ground + 2, house.y], [0.82, 0.9, 1.1], Math.PI / 2))
  })

  const alcatraz = site(-122.423, 37.8267)
  add(alcatraz, 3.4)
  parts.push(
    solid(
      'box',
      '#c9bfa6',
      [alcatraz.x - 1.4, alcatraz.ground - 0.2, alcatraz.y + 1],
      [1.2, 0.8, 0.8],
    ),
  )
  parts.push(
    solid(
      'box',
      '#cfc5ad',
      [alcatraz.x + 0.6, alcatraz.ground - 0.2, alcatraz.y + 1.2],
      [0.9, 0.6, 0.7],
    ),
  )
  parts.push(
    solid('box', '#d6ccb4', [alcatraz.x, alcatraz.ground - 0.2, alcatraz.y], [2.8, 1.2, 1]),
  )
  parts.push(
    solid('box', '#b3a993', [alcatraz.x, alcatraz.ground + 1, alcatraz.y], [2.6, 0.12, 0.9]),
  )
  parts.push(
    solid(
      'cylinder',
      '#f2efe6',
      [alcatraz.x + 1.6, alcatraz.ground, alcatraz.y - 0.4],
      [0.3, 2.4, 0.3],
    ),
  )
  parts.push(
    solid(
      'cylinder',
      '#33383d',
      [alcatraz.x + 1.6, alcatraz.ground + 2.4, alcatraz.y - 0.4],
      [0.38, 0.3, 0.38],
    ),
  )
  lights.push({
    position: [alcatraz.x + 1.6, alcatraz.ground + 2.55, alcatraz.y - 0.4],
    color: '#fff6c8',
    blink: 0.25,
  })

  const ballpark = site(-122.3893, 37.7786)
  add(ballpark, 3.6)
  parts.push(solid('cylinder', '#5fa84a', [ballpark.x, ballpark.ground, ballpark.y], [5, 0.08, 5]))
  parts.push(
    solid(
      'box',
      '#c8a06a',
      [ballpark.x - 0.9, ballpark.ground + 0.02, ballpark.y + 0.9],
      [1.3, 0.08, 1.3],
      Math.PI / 4,
    ),
  )
  for (let i = 0; i < 22; i++) {
    const angle = Math.PI * (0.15 + (i / 21) * 1.45) - Math.PI / 4
    const [cos, sin] = [Math.cos(angle), Math.sin(angle)]
    parts.push(
      solid(
        'box',
        '#3d4f6b',
        [ballpark.x - cos * 2.6, ballpark.ground, ballpark.y + sin * 2.6],
        [0.75, 0.6, 0.8],
        Math.atan2(-cos, sin),
      ),
    )
    parts.push(
      solid(
        'box',
        '#a5503e',
        [ballpark.x - cos * 3.2, ballpark.ground, ballpark.y + sin * 3.2],
        [0.8, 1.3, 0.6],
        Math.atan2(-cos, sin),
      ),
    )
  }
  for (const angle of [0.1, 0.9, 1.6].map((f) => Math.PI * f - Math.PI / 4)) {
    const base: Point = [
      ballpark.x - Math.cos(angle) * 3.6,
      ballpark.ground,
      ballpark.y + Math.sin(angle) * 3.6,
    ]
    parts.push(solid('box', '#8a8f94', base, [0.12, 2.6, 0.12]))
    lights.push({ position: [base[0], base[1] + 2.7, base[2]], color: '#ffffff' })
  }

  const pier = site(-122.4098, 37.8087)
  const sheds = ['#9c7a54', '#b48c5c', '#8a6c4a']
  let shed = 0
  let float = 0
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const [x, y] = [Math.floor(pier.x) + dx + 0.5, Math.floor(pier.y) + dy + 0.5]
      if (!wetAt(x, y) && shed < 7 && (dx + dy) % 2 === 0) {
        const ground = Math.max(heightAt(x, y), shoreHeight)
        reserve(reserved, x, y, 0.5)
        parts.push(solid('box', sheds[shed % 3]!, [x, ground - 0.1, y], [0.85, 1, 0.85]))
        parts.push(solid('gable', '#3f6b4f', [x, ground + 0.9, y], [0.85, 0.45, 0.85]))
        shed++
      } else if (wetAt(x, y) && dx > 0 && float < 5) {
        parts.push(solid('box', '#8a6a48', [x, 0, y], [0.9, 0.1, 0.5]))
        parts.push(solid('box', '#4a3a2c', [x - 0.2, 0.1, y], [0.25, 0.1, 0.12]))
        parts.push(solid('box', '#5a4636', [x + 0.2, 0.1, y + 0.05], [0.25, 0.1, 0.12]))
        float++
      }
    }
  }

  const windmill = windmillSite
  add(windmill, 1.3)
  parts.push(solid('taper', '#e9e2d0', [windmill.x, windmill.ground, windmill.y], [1.3, 2.6, 1.3]))
  parts.push(
    solid('cone', '#6b4a34', [windmill.x, windmill.ground + 2.6, windmill.y], [1.15, 0.8, 1.15]),
  )

  const conservatory = site(-122.4602, 37.7726)
  add(conservatory, 2.4)
  parts.push(
    solid(
      'cylinder',
      '#f2f2ee',
      [conservatory.x, conservatory.ground, conservatory.y],
      [1.3, 0.9, 1.3],
    ),
  )
  parts.push(
    solid(
      'dome',
      '#e8f0ee',
      [conservatory.x, conservatory.ground + 0.9, conservatory.y],
      [1.4, 0.7, 1.4],
    ),
  )
  for (const side of [-1, 1]) {
    parts.push(
      solid(
        'box',
        '#eef2ef',
        [conservatory.x + side * 1.5, conservatory.ground, conservatory.y],
        [1.8, 0.7, 0.9],
      ),
    )
    parts.push(
      solid(
        'dome',
        '#e8f0ee',
        [conservatory.x + side * 2.3, conservatory.ground + 0.7, conservatory.y],
        [0.7, 0.3, 0.7],
      ),
    )
  }

  const cliff = site(-122.5136, 37.7785)
  add(cliff, 1.4)
  parts.push(solid('box', '#d9d6cf', [cliff.x, cliff.ground - 0.2, cliff.y], [2.2, 1.1, 1.3]))
  parts.push(solid('box', '#7a7570', [cliff.x, cliff.ground + 0.9, cliff.y], [2.3, 0.12, 1.4]))

  const hoover = site(-122.1666, 37.4275)
  add(hoover, 1)
  parts.push(solid('box', '#e3cfa6', [hoover.x, hoover.ground - 0.2, hoover.y], [0.9, 7.4, 0.9]))
  parts.push(solid('box', '#ecdcb8', [hoover.x, hoover.ground + 7.2, hoover.y], [1.05, 0.9, 1.05]))
  parts.push(solid('dome', '#b5523b', [hoover.x, hoover.ground + 8.1, hoover.y], [0.9, 0.5, 0.9]))

  const campanile = site(-122.2578, 37.8721)
  add(campanile, 1)
  parts.push(
    solid('box', '#e2e0d8', [campanile.x, campanile.ground - 0.2, campanile.y], [0.8, 8.2, 0.8]),
  )
  parts.push(
    solid('box', '#d6d4cc', [campanile.x, campanile.ground + 8, campanile.y], [0.92, 1, 0.92]),
  )
  parts.push(
    solid(
      'pyramid',
      '#5f6e66',
      [campanile.x, campanile.ground + 9, campanile.y],
      [0.92, 1.8, 0.92],
    ),
  )
  lights.push({
    position: [campanile.x, campanile.ground + 8.5, campanile.y + 0.47],
    color: '#fff3d0',
  })

  const [west, north] = warp(-122.33, 37.813)
  const [east, south] = warp(-122.285, 37.792)
  const shore: { x: number; y: number; yaw: number }[] = []
  for (let y = Math.floor(north); y <= south; y += 1) {
    for (let x = Math.floor(west); x <= east; x += 1) {
      const water = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].find(([dx, dy]) => wetAt(x + 0.5 + dx!, y + 0.5 + dy!))
      if (!wetAt(x + 0.5, y + 0.5) && water) {
        shore.push({ x: x + 0.5, y: y + 0.5, yaw: Math.atan2(water[0]!, water[1]!) })
      }
    }
  }
  shore.sort((a, b) => a.x + a.y * 0.5 - (b.x + b.y * 0.5))
  const wharf = shore
    .reduce<typeof shore>(
      (picked, spot) =>
        picked.every((c) => (c.x - spot.x) ** 2 + (c.y - spot.y) ** 2 > 36)
          ? [...picked, spot]
          : picked,
      [],
    )
    .slice(0, 12)
  const containers = ['#c0392b', '#2e6da4', '#e1a730', '#3a8a5c', '#8e44ad', '#d35400']
  wharf.forEach((crane, i) => {
    const s = { x: crane.x, y: crane.y, ground: Math.max(heightAt(crane.x, crane.y), shoreHeight) }
    reserve(reserved, s.x, s.y, 1.2)
    for (const along of [-0.5, 0.5]) {
      for (const across of [-0.55, 0.55]) {
        parts.push(
          beam(
            '#dedcd4',
            offset(s, crane.yaw, along, across),
            offset(s, crane.yaw, along * 0.7, across, 3.3),
            0.16,
          ),
        )
      }
    }
    parts.push(
      solid('box', '#dedcd4', offset(s, crane.yaw, 0, 0, 3.2), [1.3, 0.35, 1.2], crane.yaw),
    )
    parts.push(
      beam('#d0563c', offset(s, crane.yaw, -1.6, 0, 3.7), offset(s, crane.yaw, 3.6, 0, 3.7), 0.28),
    )
    parts.push(
      solid('box', '#dedcd4', offset(s, crane.yaw, -0.2, 0, 3.55), [0.7, 0.55, 0.8], crane.yaw),
    )
    lights.push({
      position: offset(s, crane.yaw, 3.6, 0, 3.95),
      color: '#ff3b2f',
      blink: 0.5 + i * 0.07,
    })
    for (let k = 0; k < 6; k++) {
      const spot = offset(s, crane.yaw, -2.2 - (k % 2) * 0.6, (Math.floor(k / 2) - 1) * 1.1)
      if (wetAt(spot[0], spot[2])) continue
      reserve(reserved, spot[0], spot[2], 0.5)
      const stack = 1 + ((i + k) % 3)
      for (let level = 0; level < stack; level++) {
        parts.push(
          solid(
            'box',
            containers[(i * 3 + k + level) % containers.length]!,
            [spot[0], spot[1] + level * 0.28, spot[2]],
            [0.95, 0.27, 0.5],
            crane.yaw,
          ),
        )
      }
    }
  })

  const campus = site(-122.009, 37.3349)
  add(campus, 4.6)
  for (let i = 0; i < 40; i++) {
    const angle = (i / 40) * Math.PI * 2
    parts.push(
      solid(
        'box',
        '#eef1f2',
        [campus.x + Math.sin(angle) * 3.6, campus.ground - 0.1, campus.y + Math.cos(angle) * 3.6],
        [0.9, 0.9, 0.62],
        angle,
      ),
    )
  }
  parts.push(solid('cylinder', '#7fb069', [campus.x, campus.ground, campus.y], [6, 0.05, 6]))

  const bonita = site(-122.5296, 37.8158)
  add(bonita, 0.8)
  parts.push(solid('cylinder', '#f4f1ea', [bonita.x, bonita.ground, bonita.y], [0.35, 1.1, 0.35]))
  parts.push(
    solid('cone', '#b5523b', [bonita.x, bonita.ground + 1.25, bonita.y], [0.42, 0.35, 0.42]),
  )
  parts.push(
    solid('box', '#f4f1ea', [bonita.x + 0.5, bonita.ground, bonita.y + 0.2], [0.6, 0.45, 0.45]),
  )
  lights.push({
    position: [bonita.x, bonita.ground + 1.15, bonita.y],
    color: '#fff6c8',
    blink: 0.2,
  })

  return { parts, lights, reserved }
}

function xy([x, , z]: Point): [number, number] {
  return [x, z]
}
