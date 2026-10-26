import {
  BufferAttribute,
  BufferGeometry,
  Matrix4,
  Mesh,
  Points,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import type { RadioStation } from '../types/radio';
import { getSurfaceAltitude } from './globeView';
import { getStationIdentity } from './favorites';
import { getStationSignalGenre, type StationGenre } from './stationGenres';

export { hasStationSignal } from './stationEligibility';

export function createStationSignals(
  globe: GlobeMethods,
  stations: RadioStation[],
  onSelect: (station: RadioStation, event: PointerEvent) => void,
  genre: StationGenre = 'all'
) {
  const scene = globe.scene();
  const renderer = globe.renderer();
  const canvas = renderer.domElement;
  const camera = globe.camera();
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let positions = new Float32Array(0);
  let discovered = new Float32Array(0);
  let locations: Vector3[] = [];
  let scanAngles = new Float32Array(0);
  let scanAnglesDirty = true;
  let undiscovered = 0;
  const clock = { value: 0 };
  const still = { value: motion.matches ? 1 : 0 };
  let geometry = new BufferGeometry();
  let discovery = new BufferAttribute(discovered, 1);
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      time: clock,
      still,
      pixelRatio: { value: renderer.getPixelRatio() },
      pointSize: { value: 16 },
    },
    vertexShader: `
      attribute float discovered;
      attribute float phase;
      attribute vec3 signalColor;
      attribute float emphasis;
      uniform float time;
      uniform float still;
      uniform float pixelRatio;
      uniform float pointSize;
      varying float strength;
      varying float age;
      varying float pulse;
      varying vec3 tint;
      varying float prominence;
      void main() {
        tint = signalColor;
        prominence = emphasis;
        age = time - discovered;
        pulse = mix(0.5 + 0.5 * sin(time * 6.283185 / (1.6 + phase * 1.2) + phase * 6.283185), 0.5, still);
        strength = smoothstep(0.0, 0.22, age);
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * view;
        gl_PointSize = (pointSize + pulse * 2.0) * pixelRatio * strength * clamp(250.0 / -view.z, 0.65, 1.5) * mix(0.8, 1.0, emphasis);
      }
    `,
    fragmentShader: `
      varying float strength;
      varying float age;
      varying float pulse;
      varying vec3 tint;
      varying float prominence;
      void main() {
        if (age < 0.0) discard;
        float radius = length(gl_PointCoord - 0.5) * 2.0;
        float core = 1.0 - smoothstep(0.14, 0.3, radius);
        float halo = exp(-radius * radius * 5.0) * (0.12 + pulse * 0.13);
        float wave = exp(-pow((radius - min(age * 1.5, 1.0)) * 18.0, 2.0)) * max(0.0, 1.0 - age) * 0.4;
        float alpha = (core * (0.5 + pulse * 0.45) + halo + wave) * strength * (1.0 - smoothstep(0.8, 1.0, radius));
        if (alpha < 0.005) discard;
        gl_FragColor = vec4(mix(tint, vec3(1.0), core * 0.38), alpha * prominence);
      }
    `,
  });
  const points = new Points(geometry, material);
  points.name = 'station-signals';
  points.renderOrder = 3;
  const sweepMaterial = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { progress: { value: 0 }, fade: { value: 1 }, center: { value: new Vector2() } },
    vertexShader: `
      varying vec4 clip;
      void main() {
        clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = clip;
      }
    `,
    fragmentShader: `
      uniform float progress;
      uniform float fade;
      uniform vec2 center;
      varying vec4 clip;
      void main() {
        vec2 offset = clip.xy / clip.w - center;
        float angle = mod(atan(offset.x, offset.y) + 6.283185, 6.283185);
        float trail = mod(progress * 6.283185 - angle + 6.283185, 6.283185);
        float beam = exp(-trail * 7.0) * 0.18 + exp(-trail * 100.0) * 0.34;
        gl_FragColor = vec4(0.18, 0.95, 0.65, beam * fade);
      }
    `,
  });
  const sweepGeometry = new SphereGeometry(globe.getGlobeRadius(), 96, 48);
  const sweep = new Mesh(sweepGeometry, sweepMaterial);
  sweep.name = 'station-scan';
  sweep.renderOrder = 2;
  sweep.raycast = () => {};
  points.raycast = () => {};
  scene.add(points, sweep);
  let elapsed = 0;
  let scanStart = 0;
  let lastTime = 0;
  let lastUpdate = 0;
  let frame = 0;
  let scanning = false;
  let downX = 0;
  let downY = 0;
  let pressed = false;
  const center = new Vector3();
  const cameraPosition = new Vector3();
  const projected = new Vector3();
  const projection = new Matrix4();
  let surfaceAltitude = -1;

  function updateColors() {
    const colors = geometry.getAttribute('signalColor');
    const emphasis = geometry.getAttribute('emphasis');
    if (!colors || !emphasis) return;
    for (let index = 0; index < stations.length; index++) {
      const category = getStationSignalGenre(stations[index], genre);
      const color = parseInt(category.color.slice(1), 16);
      colors.setXYZ(
        index,
        ((color >> 16) & 255) / 255,
        ((color >> 8) & 255) / 255,
        (color & 255) / 255
      );
      emphasis.setX(index, genre === 'all' || category.id === genre ? 1 : 0.28);
    }
    colors.needsUpdate = true;
    emphasis.needsUpdate = true;
  }

  function updateGenre(nextGenre: StationGenre) {
    if (genre === nextGenre) return;
    genre = nextGenre;
    updateColors();
  }

  function updateStations(nextStations: RadioStation[]) {
    if (
      geometry.hasAttribute('position') &&
      nextStations.length === stations.length &&
      nextStations.every(
        (station, index) =>
          getStationIdentity(station) === getStationIdentity(stations[index]) &&
          station.geo_lat === stations[index].geo_lat &&
          station.geo_long === stations[index].geo_long
      )
    ) {
      const colorsChanged = nextStations.some(
        (station, index) => station.tags !== stations[index].tags
      );
      stations = nextStations;
      if (colorsChanged) updateColors();
      return;
    }
    const previous = new Map(
      stations.map((station, index) => [getStationIdentity(station), discovered[index]])
    );
    stations = nextStations;
    positions = new Float32Array(stations.length * 3);
    discovered = new Float32Array(stations.length);
    scanAngles = new Float32Array(stations.length);
    scanAnglesDirty = true;
    undiscovered = 0;
    const phases = new Float32Array(stations.length);
    const surface = getSurfaceAltitude(globe.pointOfView().altitude);
    locations = stations.map((station, index) => {
      const coords = globe.getCoords(station.geo_lat!, station.geo_long!, surface);
      const position = new Vector3(coords.x, coords.y, coords.z);
      position.toArray(positions, index * 3);
      discovered[index] =
        previous.get(getStationIdentity(station)) ??
        (motion.matches ? elapsed - 1 : scanning ? 1000000 : elapsed);
      if (discovered[index] === 1000000) undiscovered++;
      let hash = 0;
      for (const character of station.stationuuid || station.name)
        hash = (hash * 31 + character.charCodeAt(0)) | 0;
      phases[index] = (Math.abs(hash) % 1000) / 1000;
      return position;
    });
    geometry.dispose();
    geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    discovery = new BufferAttribute(discovered, 1);
    geometry.setAttribute('discovered', discovery);
    geometry.setAttribute('phase', new BufferAttribute(phases, 1));
    geometry.setAttribute(
      'signalColor',
      new BufferAttribute(new Float32Array(stations.length * 3), 3)
    );
    geometry.setAttribute('emphasis', new BufferAttribute(new Float32Array(stations.length), 1));
    updateColors();
    points.geometry = geometry;
    material.uniforms.pointSize.value = Math.max(
      8,
      Math.min(16, 16 * Math.sqrt(500 / stations.length))
    );
    surfaceAltitude = surface;
    sweep.scale.setScalar(1 + surface * 0.5);
  }

  function updateSurface() {
    scanAnglesDirty = true;
    const altitude = getSurfaceAltitude(globe.pointOfView().altitude);
    if (Math.abs(altitude - surfaceAltitude) < 0.0000001) return;
    surfaceAltitude = altitude;
    const radius = globe.getGlobeRadius() * (1 + altitude);
    for (let i = 0; i < locations.length; i++) {
      locations[i].setLength(radius);
      locations[i].toArray(positions, i * 3);
    }
    geometry.attributes.position.needsUpdate = true;
    sweep.scale.setScalar(1 + altitude * 0.5);
  }
  globe.controls().addEventListener('change', updateSurface);
  updateStations(stations);
  updateSurface();

  function startScan() {
    scanStart = elapsed;
    discovered.fill(motion.matches ? elapsed - 1 : 1000000);
    discovery.needsUpdate = true;
    scanning = !motion.matches;
    undiscovered = scanning ? stations.length : 0;
    scanAnglesDirty = true;
    sweep.visible = scanning;
    sweepMaterial.uniforms.progress.value = 0;
    sweepMaterial.uniforms.fade.value = 1;
    lastUpdate = 0;
  }

  function updateScanAngles() {
    projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    center.set(0, 0, 0).applyMatrix4(projection);
    sweepMaterial.uniforms.center.value.set(center.x, center.y);
    for (let i = 0; i < locations.length; i++) {
      if (discovered[i] < 1000000) continue;
      projected.copy(locations[i]).applyMatrix4(projection);
      scanAngles[i] =
        (Math.atan2(projected.x - center.x, projected.y - center.y) + Math.PI * 2) % (Math.PI * 2);
    }
    scanAnglesDirty = false;
  }

  function update(time: number) {
    elapsed += lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0;
    lastTime = time;
    frame = requestAnimationFrame(update);
    if (time - lastUpdate < (scanning ? 1000 / 60 : 1000 / 30)) return;
    lastUpdate = time;
    clock.value = elapsed;
    material.uniforms.pixelRatio.value = renderer.getPixelRatio();
    if (scanning) {
      const age = elapsed - scanStart;
      const progress = Math.min(age / 1.5, 1);
      if (scanAnglesDirty) updateScanAngles();
      sweepMaterial.uniforms.progress.value = progress;
      sweepMaterial.uniforms.fade.value = Math.max(0, 1 - (age - 1.5) / 0.3);
      let changed = false;
      if (undiscovered) {
        const angle = progress * Math.PI * 2;
        for (let i = 0; i < locations.length; i++) {
          if (discovered[i] < 1000000) continue;
          if (scanAngles[i] <= angle || progress === 1) {
            discovered[i] = elapsed;
            undiscovered--;
            changed = true;
          }
        }
      }
      if (changed) discovery.needsUpdate = true;
      if (age >= 1.8) {
        scanning = false;
        sweep.visible = false;
      }
    }
  }

  function settle() {
    still.value = 1;
    discovered.fill(elapsed - 1);
    discovery.needsUpdate = true;
    scanning = false;
    undiscovered = 0;
    sweep.visible = false;
  }

  function resume() {
    cancelAnimationFrame(frame);
    lastTime = 0;
    lastUpdate = 0;
    still.value = motion.matches ? 1 : 0;
    if (motion.matches) settle();
    else if (!document.hidden) frame = requestAnimationFrame(update);
  }

  function pointerDown(event: PointerEvent) {
    pressed = event.isPrimary;
    downX = event.clientX;
    downY = event.clientY;
  }

  function pointerMove(event: PointerEvent) {
    if (Math.hypot(event.clientX - downX, event.clientY - downY) > 5) pressed = false;
  }

  function pointerUp(event: PointerEvent) {
    if (!pressed || event.button !== 0) return;
    pressed = false;
    const bounds = canvas.getBoundingClientRect();
    camera.getWorldPosition(cameraPosition);
    projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const pointerX = event.clientX - bounds.left;
    const pointerY = event.clientY - bounds.top;
    const halfWidth = canvas.clientWidth / 2;
    const halfHeight = canvas.clientHeight / 2;
    const radiusSquared = globe.getGlobeRadius() ** 2;
    let nearest = 81;
    let selected = -1;
    for (let i = 0; i < locations.length; i++) {
      if (discovered[i] > elapsed || locations[i].dot(cameraPosition) <= radiusSquared) continue;
      projected.copy(locations[i]).applyMatrix4(projection);
      const x = (projected.x + 1) * halfWidth - pointerX;
      const y = (1 - projected.y) * halfHeight - pointerY;
      const distance = x * x + y * y;
      if (distance < nearest) {
        nearest = distance;
        selected = i;
      }
    }
    if (selected >= 0) onSelect(stations[selected], event);
  }

  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp);
  document.addEventListener('visibilitychange', resume);
  motion.addEventListener('change', resume);
  window.addEventListener('resize', updateSurface);
  startScan();
  resume();
  return {
    startScan,
    updateStations,
    updateGenre,
    dispose() {
      cancelAnimationFrame(frame);
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', pointerUp);
      document.removeEventListener('visibilitychange', resume);
      motion.removeEventListener('change', resume);
      window.removeEventListener('resize', updateSurface);
      globe.controls().removeEventListener('change', updateSurface);
      scene.remove(points, sweep);
      geometry.dispose();
      material.dispose();
      sweepGeometry.dispose();
      sweepMaterial.dispose();
    },
  };
}
