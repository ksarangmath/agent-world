import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPixelatedPass } from 'three/examples/jsm/postprocessing/RenderPixelatedPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'

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
  color *= mix(vec3(0.86, 0.88, 1.1), vec3(1.07, 1.0, 0.9), smoothstep(0.02, 0.5, light));
  color = mix(vec3(light), color, 1.15);
  float edge = length((vUv - 0.5) * vec2(1.0, 0.85));
  color *= 1.0 - 0.28 * smoothstep(0.35, 0.85, edge);
  gl_FragColor = vec4(color, texel.a);
}`,
}

export function PixelPass({ pixel, outline }: { pixel: number; outline: number }) {
  const { gl, scene, camera, size } = useThree()
  const composer = useMemo(() => {
    const effects = new EffectComposer(gl)
    effects.addPass(
      new RenderPixelatedPass(Math.max(2, Math.round(pixel * gl.getPixelRatio())), scene, camera, {
        normalEdgeStrength: 0.25,
        depthEdgeStrength: outline,
      }),
    )
    effects.addPass(new ShaderPass(grade))
    effects.addPass(new OutputPass())
    return effects
  }, [gl, scene, camera, pixel, outline])
  useEffect(() => composer.setSize(size.width, size.height), [composer, size])
  useEffect(
    () => () => {
      composer.passes.forEach((pass) => pass.dispose())
      composer.dispose()
    },
    [composer],
  )
  useFrame(() => composer.render(), 1)
  return null
}
