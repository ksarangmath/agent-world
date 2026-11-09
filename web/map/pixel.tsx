import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
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
import { detailZoom } from './clock'

const pixel = 2
const dither = 0.3
const [right, up, shift] = [new Vector3(), new Vector3(), new Vector3()]

const grade = {
  uniforms: { tDiffuse: { value: null }, grid: { value: new Vector2() } },
  vertexShader: `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
  fragmentShader: `
uniform sampler2D tDiffuse;
uniform vec2 grid;
varying vec2 vUv;
float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
void main() {
  vec4 texel = texture2D(tDiffuse, vUv);
  vec3 color = texel.rgb;
  float light = dot(color, vec3(0.2126, 0.7152, 0.0722));
  float threshold = 0.5 + (bayer4(vUv * grid) - 0.5) * ${dither};
  float step = floor(pow(light, 1.0 / 2.2) * 8.0 + threshold) / 8.0;
  color *= pow(max(step, 0.02), 2.2) / max(light, 1e-4);
  color *= mix(vec3(0.84, 0.86, 1.12), vec3(1.07, 1.0, 0.9), smoothstep(0.02, 0.5, light));
  color = mix(vec3(dot(color, vec3(0.2126, 0.7152, 0.0722))), color, 1.18);
  gl_FragColor = vec4(color, texel.a);
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

export function PixelPass() {
  const { gl, scene, camera, size } = useThree()
  const composer = useMemo(() => {
    const effects = new EffectComposer(gl)
    const shading = new ShaderPass(grade)
    effects.addPass(
      new OutlinedPixelPass(pixel, scene, camera, {
        normalEdgeStrength: 0.45,
        depthEdgeStrength: 0.6,
      }),
    )
    effects.addPass(shading)
    effects.addPass(new OutputPass())
    return { effects, grid: shading.uniforms.grid!.value as Vector2 }
  }, [gl, scene, camera])
  useEffect(() => {
    composer.effects.setSize(size.width, size.height)
    composer.grid.set(Math.floor(size.width / pixel), Math.floor(size.height / pixel))
  }, [composer, size])
  useEffect(
    () => () => {
      composer.effects.passes.forEach((pass) => pass.dispose())
      composer.effects.dispose()
    },
    [composer],
  )
  useFrame(() => {
    const view = camera as OrthographicCamera
    const across = (view.right - view.left) / view.zoom / composer.grid.x
    const tall = (view.top - view.bottom) / view.zoom / composer.grid.y
    right.setFromMatrixColumn(view.matrixWorld, 0)
    up.setFromMatrixColumn(view.matrixWorld, 1)
    const [along, rise] = [view.position.dot(right), view.position.dot(up)]
    shift
      .copy(right)
      .multiplyScalar(Math.round(along / across) * across - along)
      .addScaledVector(up, Math.round(rise / tall) * tall - rise)
    view.position.add(shift)
    view.updateMatrixWorld()
    composer.effects.render()
    view.position.sub(shift)
    view.updateMatrixWorld()
  }, 1)
  return null
}
