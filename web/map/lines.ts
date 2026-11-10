function reversed(line: number[]) {
  const result: number[] = []
  for (let i = line.length - 2; i >= 0; i -= 2) result.push(line[i]!, line[i + 1]!)
  return result
}

export function chains(lines: number[][]): number[][] {
  const key = (x: number, y: number) => x * 4096 + y
  const ends = new Map<number, number[]>()
  lines.forEach((line, i) => {
    for (const k of [key(line[0]!, line[1]!), key(line.at(-2)!, line.at(-1)!)]) {
      ends.set(k, [...(ends.get(k) ?? []), i])
    }
  })
  const used = new Uint8Array(lines.length)
  const extend = (chain: number[]) => {
    for (;;) {
      const [x, y] = [chain.at(-2)!, chain.at(-1)!]
      const next = ends.get(key(x, y))?.find((i) => !used[i])
      if (next === undefined) return chain
      used[next] = 1
      const line = lines[next]!
      const points = line[0] === x && line[1] === y ? line : reversed(line)
      for (let i = 2; i < points.length; i++) chain.push(points[i]!)
    }
  }
  const result: number[][] = []
  lines.forEach((line, i) => {
    if (used[i]) return
    used[i] = 1
    result.push(extend(reversed(extend([...line]))))
  })
  return result
}
