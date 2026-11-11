import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import {
  Vector2,
  Vector3,
  type Material,
  type OrthographicCamera,
  type ShaderMaterial,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import type { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import { RenderPixelatedPass } from 'three/examples/jsm/postprocessing/RenderPixelatedPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { detailZoom, quality, sky } from './clock'
import { drawingNormals } from './sightlines'

const pixels = [1, 2, 2] as const
const frameBudgetMs = 25
const settleMs = 5000
const sampleEveryMs = 1000
const strikes = 3
const probe = new Uint8Array(4)
const miniature = { blur: 7, sharp: 0.18, from: 14, full: 55 }
const glow = { strength: 0.45, radius: 0.6, threshold: 0.82 }
const [right, up, shift] = [new Vector3(), new Vector3(), new Vector3()]

const grade = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
  fragmentShader: `
uniform sampler2D tDiffuse;
varying vec2 vUv;
void main() {
  vec4 texel = texture2D(tDiffuse, vUv);
  vec3 color = texel.rgb;
  float light = dot(color, vec3(0.2126, 0.7152, 0.0722));
  float step = floor(pow(light, 1.0 / 2.2) * 8.0 + 0.5) / 8.0;
  color *= pow(max(step, 0.02), 2.2) / max(light, 1e-4);
  color *= mix(vec3(0.84, 0.86, 1.12), vec3(1.07, 1.0, 0.9), smoothstep(0.02, 0.5, light));
  color = mix(vec3(dot(color, vec3(0.2126, 0.7152, 0.0722))), color, 1.4);
  color += vec3(0.01, 0.012, 0.034) * (1.0 - smoothstep(0.0, 0.1, light));
  gl_FragColor = vec4(max(color, 0.0), texel.a);
}`,
}

const tiltShift = {
  uniforms: { tDiffuse: { value: null }, texel: { value: new Vector2() }, blur: { value: 0 } },
  vertexShader: grade.vertexShader,
  fragmentShader: `
uniform sampler2D tDiffuse;
uniform vec2 texel;
uniform float blur;
varying vec2 vUv;
void main() {
  vec2 reach = texel * blur * smoothstep(${miniature.sharp}, 0.62, length(vUv - 0.5));
  vec4 sum = texture2D(tDiffuse, vUv) * 2.0;
  for (int i = 0; i < 8; i++) {
    float angle = float(i) * 0.7853982;
    vec2 away = vec2(cos(angle), sin(angle)) * reach;
    sum += texture2D(tDiffuse, vUv + away) + texture2D(tDiffuse, vUv + away * 0.5);
  }
  gl_FragColor = sum / 18.0;
}`,
}

type PassTargets = {
  _fsQuad: FullScreenQuad
  _beautyRenderTarget: WebGLRenderTarget
  _normalRenderTarget: WebGLRenderTarget
  _normalMaterial: Material
}

class OutlinedPixelPass extends RenderPixelatedPass {
  override render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget) {
    const { _fsQuad, _beautyRenderTarget, _normalRenderTarget, _normalMaterial } =
      this as unknown as PassTargets
    const { uniforms } = _fsQuad.material as ShaderMaterial
    const detailed = quality.level === 0 && (this.camera as OrthographicCamera).zoom >= detailZoom
    uniforms.normalEdgeStrength!.value = detailed ? this.normalEdgeStrength : 0
    uniforms.depthEdgeStrength!.value = this.depthEdgeStrength
    renderer.setRenderTarget(_beautyRenderTarget)
    renderer.render(this.scene, this.camera)
    if (detailed) {
      drawingNormals.value = true
      this.scene.overrideMaterial = _normalMaterial
      renderer.setRenderTarget(_normalRenderTarget)
      renderer.render(this.scene, this.camera)
      this.scene.overrideMaterial = null
      drawingNormals.value = false
    }
    uniforms.tDiffuse!.value = _beautyRenderTarget.texture
    uniforms.tDepth!.value = _beautyRenderTarget.depthTexture
    uniforms.tNormal!.value = _normalRenderTarget.texture
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer)
    if (this.clear && !this.renderToScreen) renderer.clear()
    _fsQuad.render(renderer)
  }
}

type Passes = {
  effects: EffectComposer
  scene: OutlinedPixelPass
  bloom: UnrealBloomPass
  tilt: ShaderPass
  sampleAt: number
  slow: number
}

function settleSampling(live: Passes) {
  live.sampleAt = performance.now() + settleMs
  live.slow = 0
}

export function PixelPass() {
  const { gl, scene, camera, size } = useThree()
  const passes = useRef<Passes | null>(null)
  useEffect(() => {
    const effects = new EffectComposer(gl)
    const bloom = new UnrealBloomPass(new Vector2(), 0, glow.radius, glow.threshold)
    const tilt = new ShaderPass(tiltShift)
    const drawn = new OutlinedPixelPass(pixels[quality.level]!, scene, camera, {
      normalEdgeStrength: 0.45,
      depthEdgeStrength: 0.6,
    })
    effects.addPass(drawn)
    effects.addPass(new ShaderPass(grade))
    effects.addPass(bloom)
    effects.addPass(tilt)
    effects.addPass(new OutputPass())
    const live = { effects, scene: drawn, bloom, tilt, sampleAt: 0, slow: 0 }
    const settle = () => settleSampling(live)
    settle()
    document.addEventListener('visibilitychange', settle)
    passes.current = live
    return () => {
      document.removeEventListener('visibilitychange', settle)
      passes.current = null
      effects.passes.forEach((pass) => pass.dispose())
      effects.dispose()
    }
  }, [gl, scene, camera])
  useEffect(() => {
    const live = passes.current
    if (!live) return
    live.effects.setSize(size.width, size.height)
    settleSampling(live)
  }, [gl, scene, camera, size])
  useFrame(() => {
    const live = passes.current
    if (!live) return
    const view = camera as OrthographicCamera
    const night = 1 - sky.daylight.value
    const full = quality.level === 0
    live.bloom.enabled = full && night > 0.05
    live.bloom.strength = glow.strength * night
    const near = Math.min(
      1,
      Math.max(0, Math.log(view.zoom / miniature.from) / Math.log(miniature.full / miniature.from)),
    )
    live.tilt.enabled = full && near > 0
    live.tilt.uniforms.blur!.value = miniature.blur * near * near * (3 - 2 * near)
    live.tilt.uniforms.texel!.value.set(1 / size.width, 1 / size.height)
    const pixel = pixels[quality.level]!
    const across = (view.right - view.left) / view.zoom / Math.floor(size.width / pixel)
    const tall = (view.top - view.bottom) / view.zoom / Math.floor(size.height / pixel)
    right.setFromMatrixColumn(view.matrixWorld, 0)
    up.setFromMatrixColumn(view.matrixWorld, 1)
    const [along, rise] = [view.position.dot(right), view.position.dot(up)]
    shift
      .copy(right)
      .multiplyScalar(Math.round(along / across) * across - along)
      .addScaledVector(up, Math.round(rise / tall) * tall - rise)
    view.position.add(shift)
    view.updateMatrixWorld()
    const started = performance.now()
    live.effects.render()
    if (started >= live.sampleAt && quality.level < pixels.length - 1) {
      live.sampleAt = started + sampleEveryMs
      const context = gl.getContext()
      context.readPixels(0, 0, 1, 1, context.RGBA, context.UNSIGNED_BYTE, probe)
      live.slow = performance.now() - started > frameBudgetMs ? live.slow + 1 : 0
      if (live.slow === strikes) {
        quality.level++
        live.scene.setPixelSize(pixels[quality.level]!)
        settleSampling(live)
      }
    }
    view.position.sub(shift)
    view.updateMatrixWorld()
  }, 1)
  return null
}
