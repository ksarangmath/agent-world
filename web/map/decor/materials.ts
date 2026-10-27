import { MeshBasicMaterial } from 'three'
import { toon } from '../paint'
import { seeThrough } from '../sightlines'

export const litMaterial = toon({ vertexColors: true })
litMaterial.onBeforeCompile = seeThrough
export const glowMaterial = new MeshBasicMaterial({ vertexColors: true })
export const mistMaterial = toon({
  vertexColors: true,
  transparent: true,
  opacity: 0.28,
  depthWrite: false,
})
