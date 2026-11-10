import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import {
  Vector2,
  Vector3,
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
import { HorizontalTiltShiftShader } from 'three/examples/jsm/shaders/HorizontalTiltShiftShader.js'
import { VerticalTiltShiftShader } from 'three/examples/jsm/shaders/VerticalTiltShiftShader.js'
import { detailZoom, sky } from './clock'

const pixel = 1
const miniature = { blur: 3.5, from: 14, full: 55 }
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
  gl_FragColor = vec4(max(color, 0.0), texel.a);
}`,
}

type PassTargets = {
  _fsQuad: FullScreenQuad
  _beautyRenderTarget: WebGLRenderTarget
  _normalRenderTarget: WebGLRenderTarget
}

class OutlinedPixelPass extends RenderPixelatedPass {
  override render(
    renderer: WebGLRenderer,
    writeBuffer: WebGLRenderTarget,
    readBuffer: WebGLRenderTarget,
    deltaTime: number,
    maskActive: boolean,
  ) {
    if ((this.camera as OrthographicCamera).zoom >= detailZoom) {
      super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive)
      return
    }
    const { _fsQuad, _beautyRenderTarget, _normalRenderTarget } = this as unknown as PassTargets
    const { uniforms } = _fsQuad.material as ShaderMaterial
    uniforms.normalEdgeStrength!.value = 0
    uniforms.depthEdgeStrength!.value = this.depthEdgeStrength
    renderer.setRenderTarget(_beautyRenderTarget)
    renderer.render(this.scene, this.camera)
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
  bloom: UnrealBloomPass
  across: ShaderPass
  down: ShaderPass
}

export function PixelPass() {
  const { gl, scene, camera, size } = useThree()
  const passes = useRef<Passes | null>(null)
  useEffect(() => {
    const effects = new EffectComposer(gl)
    const bloom = new UnrealBloomPass(new Vector2(), 0, glow.radius, glow.threshold)
    const across = new ShaderPass(HorizontalTiltShiftShader)
    const down = new ShaderPass(VerticalTiltShiftShader)
    across.uniforms.r!.value = 0.5
    down.uniforms.r!.value = 0.5
    effects.addPass(
      new OutlinedPixelPass(pixel, scene, camera, {
        normalEdgeStrength: 0.45,
        depthEdgeStrength: 0.6,
      }),
    )
    effects.addPass(new ShaderPass(grade))
    effects.addPass(bloom)
    effects.addPass(across)
    effects.addPass(down)
    effects.addPass(new OutputPass())
    passes.current = { effects, bloom, across, down }
    return () => {
      passes.current = null
      effects.passes.forEach((pass) => pass.dispose())
      effects.dispose()
    }
  }, [gl, scene, camera])
  useEffect(
    () => passes.current?.effects.setSize(size.width, size.height),
    [gl, scene, camera, size],
  )
  useFrame(() => {
    const live = passes.current
    if (!live) return
    const view = camera as OrthographicCamera
    const night = 1 - sky.daylight.value
    live.bloom.enabled = night > 0.05
    live.bloom.strength = glow.strength * night
    const near = Math.min(
      1,
      Math.max(0, Math.log(view.zoom / miniature.from) / Math.log(miniature.full / miniature.from)),
    )
    const blur = miniature.blur * near * near * (3 - 2 * near)
    live.across.enabled = live.down.enabled = blur > 0
    live.across.uniforms.h!.value = blur / size.width
    live.down.uniforms.v!.value = blur / size.height
    const across = ((view.right - view.left) / view.zoom / size.width) * pixel
    const tall = ((view.top - view.bottom) / view.zoom / size.height) * pixel
    right.setFromMatrixColumn(view.matrixWorld, 0)
    up.setFromMatrixColumn(view.matrixWorld, 1)
    const [along, rise] = [view.position.dot(right), view.position.dot(up)]
    shift
      .copy(right)
      .multiplyScalar(Math.round(along / across) * across - along)
      .addScaledVector(up, Math.round(rise / tall) * tall - rise)
    view.position.add(shift)
    view.updateMatrixWorld()
    live.effects.render()
    view.position.sub(shift)
    view.updateMatrixWorld()
  }, 1)
  return null
}
