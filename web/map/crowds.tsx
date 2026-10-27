import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Vector3 } from 'three'
import { flyTo } from './camera'
import { onScreen } from './clock'
import { surfaceAt } from './elevation'
import { crowd } from './people'

export const peopleZoom = 20
const bubblePixels = 72

type Group = { count: number; x: number; y: number }

export function Crowds() {
  const { gl, camera, size } = useThree()
  const pool = useRef<HTMLButtonElement[]>([])
  const projected = useMemo(() => new Vector3(), [])
  useEffect(() => {
    const current = pool.current
    return () => current.forEach((element) => element.remove())
  }, [])
  useFrame(() => {
    const groups = new Map<number, Group>()
    if (camera.zoom < peopleZoom) {
      const cell = bubblePixels / 2 ** Math.floor(Math.log2(camera.zoom))
      for (let i = 0; i < crowd.count; i++) {
        if (!crowd.shown[i]) continue
        const [x, y] = [crowd.x[i]!, crowd.y[i]!]
        const key = Math.floor(y / cell) * 4096 + Math.floor(x / cell)
        const group = groups.get(key)
        if (group) {
          group.count++
          group.x += x
          group.y += y
        } else groups.set(key, { count: 1, x, y })
      }
    }
    let used = 0
    for (const group of groups.values()) {
      const [x, y] = [group.x / group.count, group.y / group.count]
      if (!onScreen(x, y)) continue
      let element = pool.current[used]
      if (!element) {
        element = document.createElement('button')
        element.type = 'button'
        element.className = 'crowd'
        element.addEventListener('click', () =>
          flyTo(
            Number(element!.dataset.x),
            Number(element!.dataset.y),
            Math.min(peopleZoom + 4, camera.zoom * 2.5),
          ),
        )
        gl.domElement.parentElement?.appendChild(element)
        pool.current.push(element)
      }
      projected.set(x, surfaceAt(x, y), y).project(camera)
      element.dataset.x = String(x)
      element.dataset.y = String(y)
      element.textContent = String(group.count)
      element.style.display = 'block'
      element.style.setProperty('--size', `${22 + 6 * Math.log2(group.count)}px`)
      element.style.transform = `translate(${((projected.x + 1) / 2) * size.width}px, ${((1 - projected.y) / 2) * size.height}px) translate(-50%, 6px)`
      used++
    }
    for (let i = used; i < pool.current.length; i++) pool.current[i]!.style.display = 'none'
  })
  return null
}
