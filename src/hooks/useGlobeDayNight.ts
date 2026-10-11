import { useEffect, type RefObject } from 'react';
import type { GlobeMethods } from 'react-globe.gl';
import {
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
} from 'three';
import { getSurfaceAltitude } from '../lib/globeView';
import { getSolarPosition } from '../lib/solarPosition';

export function useGlobeDayNight(
  globeRef: RefObject<GlobeMethods | undefined>,
  ready: boolean,
  detailed: { value: number }
) {
  useEffect(() => {
    const globe = globeRef.current;
    if (!ready || !globe) return;
    let active = true;
    const uniforms = {
      sunDirection: { value: new Vector3() },
      nightMap: { value: null as ReturnType<TextureLoader['load']> | null },
      hasNightMap: { value: 0 },
      detailed,
    };
    const material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      uniforms,
      vertexShader: `
        varying vec3 location;
        varying vec2 mapUv;
        void main() {
          location = (modelMatrix * vec4(position, 1.0)).xyz;
          mapUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 sunDirection;
        uniform sampler2D nightMap;
        uniform float hasNightMap;
        uniform float detailed;
        varying vec3 location;
        varying vec2 mapUv;
        void main() {
          float exposure = dot(normalize(location), sunDirection);
          float night = 1.0 - smoothstep(-0.20, 0.16, exposure);
          float twilight = exp(-pow(exposure / 0.13, 2.0));
          vec3 cities = texture2D(nightMap, mapUv).rgb;
          vec3 shade = mix(vec3(0.018, 0.025, 0.055), cities * 0.85, hasNightMap * (1.0 - detailed));
          vec3 horizon = mix(vec3(0.16, 0.13, 0.29), vec3(0.53, 0.29, 0.19), smoothstep(-0.10, 0.10, exposure));
          shade = mix(shade, horizon, twilight * 0.50);
          gl_FragColor = vec4(shade, night * 0.90 + twilight * 0.055);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          gl_FragColor.rgb += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
        }
      `,
    });
    const geometry = new SphereGeometry(globe.getGlobeRadius(), 256, 128);
    const shade = new Mesh(geometry, material);
    shade.name = 'globe-day-night';
    shade.rotation.y = -Math.PI / 2;
    shade.renderOrder = 1;
    shade.raycast = () => {};
    globe.scene().add(shade);

    function updateSun() {
      if (document.hidden) return;
      const sun = getSolarPosition(new Date());
      const position = globe!.getCoords(sun.lat, sun.lng);
      uniforms.sunDirection.value.set(position.x, position.y, position.z).normalize();
    }
    function updateSurface() {
      shade.scale.setScalar(1 + getSurfaceAltitude(globe!.pointOfView().altitude) * 0.25);
    }
    updateSun();
    updateSurface();
    const timer = setInterval(updateSun, 60000);
    document.addEventListener('visibilitychange', updateSun);
    globe.controls().addEventListener('change', updateSurface);
    const nightTexture = new TextureLoader().load(
      `${import.meta.env.BASE_URL}maps/earth-night.jpg`,
      (texture) => {
        if (!active) {
          texture.dispose();
          return;
        }
        texture.colorSpace = SRGBColorSpace;
        uniforms.nightMap.value = texture;
        uniforms.hasNightMap.value = 1;
      },
      undefined,
      () => undefined
    );
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', updateSun);
      globe.controls().removeEventListener('change', updateSurface);
      globe.scene().remove(shade);
      geometry.dispose();
      material.dispose();
      nightTexture.dispose();
    };
  }, [globeRef, ready, detailed]);
}
