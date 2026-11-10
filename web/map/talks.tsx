import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Vector3 } from 'three'
import { detailZoom } from './clock'
import { talks } from './people'

export function Talks({ onOpen }: { onOpen: (conversationId: string) => void }) {
  const { gl, camera, size } = useThree()
  const pool = useRef<HTMLButtonElement[]>([])
  const projected = useMemo(() => new Vector3(), [])
  const open = useRef(onOpen)
  useEffect(() => {
    open.current = onOpen
  }, [onOpen])
  useEffect(() => {
    const current = pool.current
    return () => current.forEach((element) => element.remove())
  }, [])
  useFrame(() => {
    const scale = Math.min(34, Math.max(18, camera.zoom * 1.2))
    const shown = camera.zoom >= detailZoom ? talks.count : 0
    for (let i = 0; i < shown; i++) {
      let element = pool.current[i]
      if (!element) {
        element = document.createElement('button')
        element.type = 'button'
        element.className = 'talk'
        element.title = 'Read the conversation'
        element.append(...[0, 1, 2].map(() => document.createElement('i')))
        element.addEventListener('click', () => open.current(element!.dataset.id!))
        gl.domElement.parentElement?.appendChild(element)
        pool.current.push(element)
      }
      projected.set(talks.x[i]!, talks.height[i]!, talks.y[i]!).project(camera)
      element.dataset.id = talks.id[i]!
      element.style.display = 'flex'
      element.style.setProperty('--size', `${scale}px`)
      element.style.transform = `translate(${((projected.x + 1) / 2) * size.width}px, ${((1 - projected.y) / 2) * size.height}px) translate(-50%, -100%)`
    }
    for (let i = shown; i < pool.current.length; i++) pool.current[i]!.style.display = 'none'
  })
  return null
}
