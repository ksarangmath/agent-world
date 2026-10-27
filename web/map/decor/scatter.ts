import geography from '../../../shared/map/geography.json'
import { mapHeight, mapWidth, warp } from '../../../shared/map/grid'
import { places } from '../../../shared/map/places'
import { accessRoad, roads } from '../../../shared/map/route'
import { spots } from '../../../shared/map/spots'
import { groundAt } from '../../../shared/map/terrain'
import type { City } from '../city'
import { hash, heightAt, noise, shoreDistance, surfaceAt } from '../elevation'
import { reservedTiles } from '../landmarks'
import type { GlowKit, LitKit } from './kits'

type Size = [number, number, number]
export type Placed<K> = {
  kit: K
  x: number
  y: number
  base: number
  yaw: number
  size: Size
  tint: string
}
export type Spot = { x: number; y: number; base: number; phase: number }

const area = (lon: number, lat: number, radius: number) => {
  const [x, y] = warp(lon, lat)
  return { x, y, radius }
}

const districts = {
  mish: area(-122.4148, 37.7599, 12),
  startup: area(-122.4, 37.779, 10),
  founders: area(-122.389, 37.758, 8),
  towers: area(-122.3999, 37.7946, 7),
  lanterns: area(-122.4078, 37.7941, 4),
  napoli: area(-122.41, 37.8, 5),
  castro: area(-122.435, 37.7609, 6),
  haight: area(-122.447, 37.769, 5),
  fogset: area(-122.495, 37.754, 20),
  dumplings: area(-122.48, 37.78, 16),
  wharf: area(-122.4098, 37.8087, 7),
  marinaGreen: area(-122.4365, 37.8058, 3),
  park: area(-122.483, 37.7695, 26),
}

type District = keyof typeof districts
const inside = (name: District, x: number, y: number) => {
  const d = districts[name]
  return (x - d.x) ** 2 + (y - d.y) ** 2 <= d.radius ** 2
}

const wilds = [
  { biome: 'town', at: warp(-122.44, 37.765) },
  { biome: 'redwood', at: warp(-122.56, 37.9) },
  { biome: 'golden', at: warp(-122.2, 37.83) },
  { biome: 'golden', at: warp(-122.42, 37.62) },
  { biome: 'vale', at: warp(-122.05, 37.4) },
] as const
const biomeAt = (x: number, y: number) =>
  wilds.reduce((best, wild) =>
    (wild.at[0] - x) ** 2 + (wild.at[1] - y) ** 2 < (best.at[0] - x) ** 2 + (best.at[1] - y) ** 2
      ? wild
      : best,
  ).biome

const bold = ['#ff006e', '#3a86ff', '#ffbe0b', '#06d6a0', '#8338ec', '#fb5607']
const neon = ['#ff4fd8', '#4cc9f0', '#b8f23b', '#ff9e00', '#f9f871']
const pastel = ['#ffafcc', '#a2d2ff', '#cdb4db', '#ffffff', '#bde0fe', '#ffc8dd']
const pick = <T>(list: readonly T[], seed: number) =>
  list[Math.floor(seed * list.length) % list.length]!
const index = (x: number, y: number) => y * mapWidth + x
const onMap = (x: number, y: number) => x >= 0 && y >= 0 && x < mapWidth && y < mapHeight
const isRoad = (x: number, y: number) => onMap(x, y) && roads[index(x, y)]! > 0
const sides = [
  { dx: 0, dy: -1, yaw: Math.PI },
  { dx: 1, dy: 0, yaw: Math.PI / 2 },
  { dx: 0, dy: 1, yaw: 0 },
  { dx: -1, dy: 0, yaw: -Math.PI / 2 },
] as const

function blockedTiles(city: City): Uint8Array {
  const blocked = new Uint8Array(mapWidth * mapHeight)
  for (const building of city.buildings) {
    for (let y = Math.floor(building.y); y < Math.ceil(building.y + building.depth); y++) {
      for (let x = Math.floor(building.x); x < Math.ceil(building.x + building.width); x++) {
        if (onMap(x, y)) blocked[index(x, y)] = 1
      }
    }
  }
  for (const tree of city.trees) blocked[index(Math.floor(tree.x), Math.floor(tree.y))] = 1
  for (const tile of reservedTiles) blocked[tile] = 1
  for (const place of places) {
    for (const spot of spots(place)) {
      blocked[index(spot.x, spot.y)] = 1
      const road = accessRoad(spot)
      const steps = 4 * Math.max(Math.abs(road.x - spot.x), Math.abs(road.y - spot.y))
      for (let k = 0; k <= steps; k++) {
        const t = steps ? k / steps : 0
        blocked[
          index(
            Math.floor(spot.x + 0.5 + (road.x - spot.x) * t),
            Math.floor(spot.y + 0.5 + (road.y - spot.y) * t),
          )
        ] = 1
      }
    }
  }
  return blocked
}

export function scatter(city: City) {
  const lit: Placed<LitKit>[] = []
  const glow: Placed<GlowKit>[] = []
  const flames: Spot[] = []
  const seaLions: Spot[] = []
  const kites: Spot[] = []
  const mist: Spot[] = []
  const blocked = blockedTiles(city)
  const free = (x: number, y: number) => {
    if (!onMap(x, y) || blocked[index(x, y)] || roads[index(x, y)]) return false
    const kind = groundAt(x, y)
    return kind !== 'ocean' && kind !== 'water'
  }
  const claim = (x: number, y: number, radius = 1) => {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (onMap(x + dx, y + dy)) blocked[index(x + dx, y + dy)] = 1
      }
    }
  }
  const put = (
    kit: LitKit,
    x: number,
    y: number,
    yaw: number,
    tint = '#ffffff',
    size: Size = [1, 1, 1],
    lift = 0,
  ) => lit.push({ kit, x, y, base: surfaceAt(x, y) + lift, yaw, size, tint })
  const shine = (kit: GlowKit, x: number, y: number, base: number, yaw: number, tint = '#ffffff') =>
    glow.push({ kit, x, y, base, yaw, size: [1, 1, 1], tint })
  const facingRoad = (x: number, y: number) =>
    sides.find((side) => isRoad(x + side.dx, y + side.dy))
  const curbside = (
    x: number,
    y: number,
    seed: number,
  ): { kit: LitKit; tint: string; facing: boolean } | null => {
    if (inside('mish', x, y) && seed < 0.3)
      return {
        kit: 'tacoTruck',
        tint: pick(['#ffffff', '#ffe5ec', '#d8f3dc'], seed * 9),
        facing: false,
      }
    if (inside('haight', x, y) && seed < 0.12)
      return { kit: 'flowerBus', tint: '#ffffff', facing: false }
    if (inside('founders', x, y) && seed < 0.2)
      return { kit: 'container', tint: pick(bold, seed * 17), facing: false }
    if ((inside('startup', x, y) || inside('founders', x, y)) && seed < 0.45)
      return { kit: seed < 0.32 ? 'scooter' : 'robot', tint: '#ffffff', facing: true }
    if (inside('wharf', x, y) && seed < 0.35)
      return { kit: 'crabStand', tint: '#ffffff', facing: true }
    if ((inside('fogset', x, y) || inside('dumplings', x, y)) && seed < 0.28)
      return {
        kit: 'foodStall',
        tint: pick(['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#ff70a6'], seed * 23),
        facing: true,
      }
    return null
  }

  const walls = city.buildings.filter((b) => b.width >= 1 && b.depth >= 1)
  for (const b of walls) {
    const cx = b.x + b.width / 2
    const cy = b.y + b.depth / 2
    const residential = b.height < 2.4 && b.width * b.depth <= 6
    sides.forEach((side, n) => {
      const along = side.dx ? b.depth : b.width
      const [wx, wy] = [cx + (side.dx * b.width) / 2, cy + (side.dy * b.depth) / 2]
      const [ox, oy] = [Math.floor(wx + side.dx * 0.5), Math.floor(wy + side.dy * 0.5)]
      if (!isRoad(ox, oy)) return
      const seed = hash(Math.floor(wx * 3) + n, Math.floor(wy * 3) - n)
      const ground = heightAt(wx, wy)
      const top = b.base + b.height
      const at = (offset: number): [number, number] => [
        wx + side.dx * offset,
        wy + side.dy * offset,
      ]
      if ((inside('mish', cx, cy) || inside('haight', cx, cy)) && seed < 0.45) {
        const kit = inside('haight', cx, cy)
          ? 'muralTieDye'
          : seed < 0.22
            ? 'muralSun'
            : 'muralWave'
        const [mx, my] = at(0.03)
        const height = Math.min(top - ground - 0.3, 1.5)
        if (height > 0.5) {
          lit.push({
            kit,
            x: mx,
            y: my,
            base: ground + 0.2,
            yaw: side.yaw,
            size: [along * 0.8, height, 1],
            tint: '#ffffff',
          })
        }
      }
      if (
        (inside('mish', cx, cy) || inside('startup', cx, cy) || inside('founders', cx, cy)) &&
        seed > 0.7
      ) {
        const [nx, ny] = at(0.06)
        shine('neon', nx, ny, Math.min(top - 0.5, ground + 1.1), side.yaw, pick(neon, seed * 7))
      }
      if (inside('castro', cx, cy) && seed > 0.55) {
        const [fx, fy] = at(0.2)
        put('rainbowFlag', fx, fy, side.yaw + Math.PI / 2)
      }
      if (residential && !inside('towers', cx, cy) && seed > 0.3 && seed < 0.5) {
        const [hx, hy] = at(0.14)
        put('hydrangea', hx, hy, side.yaw, pick(pastel, seed * 11))
      }
    })
    const roof = hash(Math.floor(cx * 2), Math.floor(cy * 2))
    if (b.gable === 'none' && (inside('startup', cx, cy) || inside('founders', cx, cy))) {
      if (roof < 0.3) {
        const road = sides.find((side) =>
          isRoad(
            Math.floor(cx + side.dx * (b.width / 2 + 0.5)),
            Math.floor(cy + side.dy * (b.depth / 2 + 0.5)),
          ),
        )
        lit.push({
          kit: 'billboard',
          x: cx,
          y: cy,
          base: b.base + b.height,
          yaw: road?.yaw ?? 0,
          size: [0.8, 0.8, 0.8],
          tint: pick(bold, roof * 13),
        })
      } else if (roof < 0.55 && inside('founders', cx, cy)) {
        lit.push({
          kit: 'solarPanel',
          x: cx,
          y: cy,
          base: b.base + b.height,
          yaw: 0,
          size: [Math.min(b.width, 2), 1, Math.min(b.depth, 2)],
          tint: '#ffffff',
        })
      }
    }
    if (inside('towers', cx, cy) && b.height > 3 && hash(Math.floor(cx), Math.floor(cy)) < 0.6) {
      lit.push({
        kit: 'towerFlag',
        x: cx,
        y: cy,
        base: b.base + b.height,
        yaw: 0.6,
        size: [1, 1, 1],
        tint: pick(bold, hash(cx, cy * 3)),
      })
    }
  }

  for (let y = 1; y < mapHeight - 1; y++) {
    for (let x = 1; x < mapWidth - 1; x++) {
      const [cx, cy] = [x + 0.5, y + 0.5]
      const seed = hash(x * 13 + 7, y * 17 + 3)
      if (isRoad(x, y)) {
        const across =
          isRoad(x - 1, y) && isRoad(x + 1, y) && !isRoad(x, y - 1) && !isRoad(x, y + 1)
        const down = isRoad(x, y - 1) && isRoad(x, y + 1) && !isRoad(x - 1, y) && !isRoad(x + 1, y)
        const branches = [
          isRoad(x - 1, y),
          isRoad(x + 1, y),
          isRoad(x, y - 1),
          isRoad(x, y + 1),
        ].filter(Boolean).length
        const lights = inside('lanterns', cx, cy)
          ? 'lantern'
          : inside('mish', cx, cy) || inside('napoli', cx, cy)
            ? 'bulb'
            : null
        if (lights && (across || down) && (x + y) % 3 === 0) {
          const height = surfaceAt(cx, cy) + 1.45
          for (let k = 0; k < 6; k++) {
            const t = k / 5 - 0.5
            const sag = 0.18 * (1 - 4 * t * t)
            const [lx, ly] = across ? [cx, cy + t * 1.6] : [cx + t * 1.6, cy]
            shine(
              lights,
              lx,
              ly,
              height - sag,
              0,
              lights === 'lantern'
                ? '#ffffff'
                : pick(['#fff1b8', '#ffd6a5', '#caffbf', '#ffadad'], hash(x + k, y)),
            )
          }
        }
        if (inside('castro', cx, cy) && branches >= 3 && seed < 0.7)
          put('rainbowDecal', cx, cy, (x + y) % 2 ? 0 : Math.PI / 2)
        const dry = groundAt(x, y) !== 'water' && groundAt(x, y) !== 'ocean'
        const edge = sides[Math.floor(seed * 4)]!
        const curb = [edge, ...sides].find((side) => !isRoad(x + side.dx, y + side.dy))
        if (!dry || !curb) continue
        const [sx, sy] = [curb.dx, curb.dy]
        const [px, py] = [cx + sx * 0.34, cy + sy * 0.34]
        const along = Math.atan2(sy, sx) + (seed < 0.25 ? Math.PI : 0)
        const toward = Math.atan2(-sx, -sy)
        const parked = (x + y) % 2 === 0 ? curbside(cx, cy, seed) : null
        if (parked) {
          put(parked.kit, px, py, parked.facing ? toward : along, parked.tint, [0.8, 0.8, 0.8])
          if (parked.kit === 'foodStall') shine('lantern', px, py, surfaceAt(px, py) + 0.7, toward)
        } else if (!lights && (across || down) && (x * 3 + y * 5) % 7 === 0 && seed < 0.5) {
          const [lx, ly] = [cx + sx * 0.45, cy + sy * 0.45]
          const yaw = Math.atan2(sy, -sx)
          put('lampPost', lx, ly, yaw)
          shine('lampLight', lx, ly, surfaceAt(lx, ly), yaw)
        }
        continue
      }
      if (!free(x, y)) continue
      const kind = groundAt(x, y)
      const road = facingRoad(x, y)
      const roadYaw = road?.yaw ?? seed * Math.PI * 2
      const big = (kit: LitKit, tint = '#ffffff') => {
        put(kit, cx, cy, roadYaw, tint)
        claim(x, y)
      }
      if ((inside('startup', cx, cy) || inside('founders', cx, cy)) && seed < 0.3) {
        if (seed < 0.1 && inside('founders', cx, cy)) big('container', pick(bold, seed * 17))
        else if (seed < 0.2) put('scooter', cx + 0.2, cy, seed * 20)
        else put('robot', cx, cy - 0.15, roadYaw)
      } else if (inside('towers', cx, cy) && seed < 0.12) big('fountain')
      else if (inside('lanterns', cx, cy) && seed < 0.2)
        put('hydrangea', cx, cy, roadYaw, '#ff595e')
      else if (inside('napoli', cx, cy) && seed < 0.35)
        put('umbrella', cx, cy, 0, pick(['#e63946', '#2a9d8f', '#f4a261'], seed * 5))
      else if (kind === 'sand') {
        if (seed < 0.025) {
          put('bonfire', cx, cy, seed * 9)
          flames.push({ x: cx, y: cy, base: surfaceAt(cx, cy) + 0.08, phase: seed * 50 })
          claim(x, y)
        } else if (seed < 0.05) big('surfShack')
        else if (seed < 0.16)
          put('umbrella', cx, cy, 0, pick(['#ff595e', '#ffca3a', '#1982c4', '#8ac926'], seed * 13))
        else if (seed < 0.25)
          put(
            'surfboard',
            cx + 0.2,
            cy,
            seed * 6,
            pick(['#2ec4b6', '#ff9f1c', '#e71d36', '#ffbf69'], seed * 7),
          )
        else if (seed < 0.26) big('volleyballNet')
      } else if (kind === 'park') {
        const meadow = noise(x / 5, y / 5)
        if (inside('park', cx, cy) && meadow > 0.25 && seed < 0.3)
          put('flowerClump', cx, cy, seed * 6)
        else if (road && seed < 0.04) put('bench', cx, cy, roadYaw)
      } else if (kind === 'land' || kind === 'campus') {
        const wild =
          !road && !isRoad(x + 2, y) && !isRoad(x - 2, y) && !isRoad(x, y + 2) && !isRoad(x, y - 2)
        const biome = biomeAt(x, y)
        const patch = noise(x / 9 + 40, y / 9 + 40)
        if (!wild) {
          if (road && biome === 'town' && seed < 0.06) put('flowerClump', cx, cy, seed * 6)
          continue
        }
        if (biome === 'redwood' && patch > 0.05 && seed < 0.22) {
          put('giantRedwood', cx + 0.2 * (seed - 0.1), cy, seed * 12, '#ffffff', [
            0.8 + seed * 2,
            0.8 + seed * 2.5,
            0.8 + seed * 2,
          ])
          claim(x, y)
          if (seed < 0.02)
            mist.push({ x: cx, y: cy, base: surfaceAt(cx, cy) + 1.4, phase: seed * 80 })
        } else if (biome === 'golden') {
          if (patch > 0.35 && y % 2 === 0 && seed < 0.85) put('vines', cx, cy, 0)
          else if (seed < 0.05) {
            put('oak', cx, cy, seed * 20, '#ffffff', [1 + seed * 4, 1 + seed * 4, 1 + seed * 4])
            claim(x, y)
          }
        } else if (biome === 'vale') {
          if (patch > 0.3 && x % 2 === 0 && y % 2 === 0) put('blossomTree', cx, cy, seed * 6)
          else if (patch < -0.35 && y % 2 === 0) put('solarPanel', cx, cy, 0)
        }
      }
    }
  }

  const windmill = warp(-122.5094, 37.7705)
  for (let row = 0; row < 5; row++) {
    for (let column = 0; column < 3; column++) {
      const [tx, ty] = [windmill[0] + 2 + column * 1.1, windmill[1] - 2 + row * 0.7]
      if (free(Math.floor(tx), Math.floor(ty)))
        put(
          'tulips',
          tx,
          ty,
          0,
          pick(['#ff4d6d', '#ffd60a', '#ff8fab', '#ffffff', '#c77dff'], row * 0.21 + column * 0.13),
        )
    }
  }

  const paddock = warp(-122.4985, 37.7698)
  const [pw, pd] = [5, 3]
  for (let i = 0; i < pw; i++) {
    put('fence', paddock[0] - pw / 2 + i + 0.5, paddock[1] - pd / 2, 0)
    put('fence', paddock[0] - pw / 2 + i + 0.5, paddock[1] + pd / 2, 0)
  }
  for (let i = 0; i < pd; i++) {
    put('fence', paddock[0] - pw / 2, paddock[1] - pd / 2 + i + 0.5, Math.PI / 2)
    put('fence', paddock[0] + pw / 2, paddock[1] - pd / 2 + i + 0.5, Math.PI / 2)
  }
  for (let i = 0; i < 4; i++) {
    put(
      'bison',
      paddock[0] - 1.5 + i,
      paddock[1] + (i % 2 ? 0.5 : -0.4),
      0.8 + i * 1.7,
      '#ffffff',
      [0.9, 0.9, 0.9],
    )
  }

  const grant = geography.named['Grant Ave'].flat()
  let south = 0
  for (let i = 1; i < grant.length; i += 2) if (grant[i]! > grant[south + 1]!) south = i - 1
  const [gx, gy] = [grant[south]! + 0.5, grant[south + 1]! + 0.5]
  put('gate', gx, gy, 0, '#ffffff', [0.7, 0.7, 0.7])

  for (const name of ['Dolores St', 'The Embarcadero'] as const) {
    for (const line of geography.named[name]) {
      for (let i = 0; i + 3 < line.length; i += 2) {
        const [ax, ay, bx, by] = [line[i]!, line[i + 1]!, line[i + 2]!, line[i + 3]!]
        const length = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2) || 1
        const [nx, ny] = [(by - ay) / length, -(bx - ax) / length]
        for (let d = 0; d < length; d += 2.5) {
          for (const side of [-1, 1]) {
            const [px, py] = [
              ax + 0.5 + ((bx - ax) * d) / length + side * 0.46 * nx,
              ay + 0.5 + ((by - ay) * d) / length + side * 0.46 * ny,
            ]
            const [tx, ty] = [Math.floor(px + side * 0.6 * nx), Math.floor(py + side * 0.6 * ny)]
            if (onMap(tx, ty) && groundAt(tx, ty) !== 'water' && groundAt(tx, ty) !== 'ocean') {
              put('palm', px, py, hash(px, py) * 6)
            }
          }
        }
      }
    }
  }

  const pier = districts.wharf
  for (let ring = 2; ring < 9 && seaLions.length < 14; ring++) {
    for (let k = 0; k < 12 && seaLions.length < 14; k++) {
      const [dx, dy] = [pier.x + ring * Math.cos(k * 0.52), pier.y + ring * Math.sin(k * 0.52)]
      const tile = index(Math.floor(dx), Math.floor(dy))
      if (
        !onMap(Math.floor(dx), Math.floor(dy)) ||
        shoreDistance[tile]! < 1 ||
        shoreDistance[tile]! > 3
      )
        continue
      if (hash(ring, k) > 0.5) continue
      lit.push({
        kit: 'floatingDock',
        x: dx,
        y: dy,
        base: 0.02,
        yaw: k * 0.52,
        size: [1, 1, 1],
        tint: '#ffffff',
      })
      for (let n = 0; n < 3; n++) {
        seaLions.push({
          x: dx + (n - 1) * 0.5,
          y: dy + (n % 2 ? 0.2 : -0.2),
          base: 0.1,
          phase: hash(ring * 7 + n, k) * 20,
        })
      }
    }
  }

  const green = districts.marinaGreen
  for (let k = 0; k < 6; k++) {
    kites.push({
      x: green.x + (hash(k, 3) - 0.5) * 5,
      y: green.y + (hash(3, k) - 0.5) * 3,
      base: surfaceAt(green.x, green.y),
      phase: k * 1.7,
    })
  }

  const whales: Spot[] = []
  for (const row of [0.3, 0.42, 0.55, 0.68]) {
    const y = Math.floor(mapHeight * row)
    let x = 0
    while (x < mapWidth && shoreDistance[index(x, y)]! > 14) x++
    if (x > 8) whales.push({ x: x - 6, y, base: 0, phase: row * 40 })
  }
  const dolphins = [warp(-122.43, 37.818), warp(-122.36, 37.8), warp(-122.47, 37.835)].flatMap(
    ([x, y], pod) =>
      [0, 1, 2].map((n) => ({
        x: x + n * 0.7,
        y: y + (n % 2) * 0.6,
        base: 0,
        phase: pod * 3 + n * 0.45,
      })),
  )

  return { lit, glow, flames, seaLions, kites, mist, whales, dolphins }
}

export type Scattered = ReturnType<typeof scatter>
