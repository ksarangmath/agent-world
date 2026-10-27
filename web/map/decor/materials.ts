import { MeshBasicMaterial, MeshLambertMaterial } from 'three'

export const litMaterial = new MeshLambertMaterial({ vertexColors: true, flatShading: true })
export const glowMaterial = new MeshBasicMaterial({ vertexColors: true })
export const mistMaterial = new MeshLambertMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 0.28,
  depthWrite: false,
})
