import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Vector3 } from 'three'
import type { WorldPerson } from '../../shared/api'
import { placesById } from '../../shared/map/places'
import { detailZoom } from './clock'
import { closeZoom } from './labels'
import { sleepers, talks, travelers } from './people'
import { watch } from './watching'

const tail = 6

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
      element.style.transform = `translate(${((projected.x + 1) / 2) * size.width}px, ${((1 - projected.y) / 2) * size.height}px) translate(-50%, calc(-100% - ${tail}px))`
    }
    for (let i = shown; i < pool.current.length; i++) pool.current[i]!.style.display = 'none'
  })
  return null
}

export function Snores() {
  const { gl, camera, size } = useThree()
  const pool = useRef<HTMLSpanElement[]>([])
  const projected = useMemo(() => new Vector3(), [])
  useEffect(() => {
    const current = pool.current
    return () => current.forEach((element) => element.remove())
  }, [])
  useFrame(() => {
    const shown = camera.zoom >= detailZoom ? sleepers.count : 0
    for (let i = 0; i < shown; i++) {
      let element = pool.current[i]
      if (!element) {
        element = document.createElement('span')
        element.className = 'snore'
        element.append(
          ...['z', 'z', 'z'].map((letter) =>
            Object.assign(document.createElement('i'), { textContent: letter }),
          ),
        )
        gl.domElement.parentElement?.appendChild(element)
        pool.current.push(element)
      }
      projected.set(sleepers.x[i]!, sleepers.height[i]!, sleepers.y[i]!).project(camera)
      element.style.setProperty('display', 'flex')
      element.style.setProperty(
        'transform',
        `translate(${((projected.x + 1) / 2) * size.width}px, ${((1 - projected.y) / 2) * size.height}px) translate(-50%, -100%)`,
      )
    }
    for (let i = shown; i < pool.current.length; i++) pool.current[i]!.style.display = 'none'
  })
  return null
}

export function Travelers() {
  const { gl, camera, size } = useThree()
  const pool = useRef<HTMLButtonElement[]>([])
  const marked = useRef<WorldPerson[]>([])
  const projected = useMemo(() => new Vector3(), [])
  useEffect(() => {
    const current = pool.current
    return () => current.forEach((element) => element.remove())
  }, [])
  useFrame(() => {
    const shown = camera.zoom < closeZoom ? travelers.count : 0
    for (let i = 0; i < shown; i++) {
      const person = travelers.who[i]!
      let element = pool.current[i]
      if (!element) {
        element = document.createElement('button')
        element.type = 'button'
        element.className = 'traveler'
        element.addEventListener('click', () => watch(marked.current[i]!))
        const overlay = gl.domElement.parentElement
        overlay?.insertBefore(element, overlay.querySelector('.place-label'))
        pool.current.push(element)
      }
      if (marked.current[i] !== person) {
        marked.current[i] = person
        const going = `${person.name}, on the way to ${placesById.get(person.placeId)?.name ?? 'somewhere'}`
        element.setAttribute('title', going)
        element.setAttribute('aria-label', going)
      }
      projected.set(travelers.x[i]!, travelers.height[i]!, travelers.y[i]!).project(camera)
      element.style.setProperty('display', 'block')
      element.style.setProperty(
        'transform',
        `translate(${((projected.x + 1) / 2) * size.width}px, ${((1 - projected.y) / 2) * size.height}px) translate(-50%, -100%)`,
      )
    }
    for (let i = shown; i < pool.current.length; i++) pool.current[i]!.style.display = 'none'
  })
  return null
}
