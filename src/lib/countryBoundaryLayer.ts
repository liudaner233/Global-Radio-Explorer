import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments, Vector3 } from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import type { CountryFeature } from './countries';
import { getSurfaceAltitude } from './globeView';

const segmentAngle = (0.25 * Math.PI) / 180;

function isCoordinate(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    Math.abs(value[0]) <= 180 &&
    Math.abs(value[1]) <= 90
  );
}

export function createCountryBoundaryGeometry(
  globe: Pick<GlobeMethods, 'getCoords' | 'getGlobeRadius'>,
  countries: CountryFeature[]
) {
  const positions: number[] = [];
  const seen = new Set<string>();
  const start = new Vector3();
  const end = new Vector3();
  const axis = new Vector3();
  const previous = new Vector3();
  const current = new Vector3();
  const radius = globe.getGlobeRadius();

  function addEdge(from: [number, number], to: [number, number]) {
    const fromKey = `${from[0] === 180 ? -180 : from[0]}:${from[1]}`;
    const toKey = `${to[0] === 180 ? -180 : to[0]}:${to[1]}`;
    const key = fromKey < toKey ? `${fromKey}|${toKey}` : `${toKey}|${fromKey}`;
    if (seen.has(key)) return;
    seen.add(key);
    const first = globe.getCoords(from[1], from[0], 0);
    const last = globe.getCoords(to[1], to[0], 0);
    start.set(first.x, first.y, first.z).normalize();
    end.set(last.x, last.y, last.z).normalize();
    const angle = Math.acos(Math.max(-1, Math.min(1, start.dot(end))));
    if (angle < 1e-10) return;
    axis.crossVectors(start, end);
    if (axis.lengthSq() < 1e-12)
      axis.set(Math.abs(start.x) < 0.9 ? 1 : 0, Math.abs(start.x) < 0.9 ? 0 : 1, 0).cross(start);
    axis.normalize();
    const count = Math.ceil(angle / segmentAngle);
    previous.copy(start).multiplyScalar(radius);
    for (let index = 1; index <= count; index++) {
      if (index === count) current.copy(end).multiplyScalar(radius);
      else
        current
          .copy(start)
          .applyAxisAngle(axis, (angle * index) / count)
          .multiplyScalar(radius);
      positions.push(previous.x, previous.y, previous.z, current.x, current.y, current.z);
      previous.copy(current);
    }
  }

  function addPolygon(value: unknown) {
    if (!Array.isArray(value)) return;
    for (const ring of value) {
      if (!Array.isArray(ring) || ring.length < 3 || !ring.every(isCoordinate)) continue;
      for (let index = 0; index < ring.length; index++)
        addEdge(ring[index], ring[(index + 1) % ring.length]);
    }
  }

  for (const country of countries) {
    if (!country.geometry || typeof country.geometry !== 'object') continue;
    const geometry = country.geometry as { type?: unknown; coordinates?: unknown };
    if (geometry.type === 'Polygon') addPolygon(geometry.coordinates);
    else if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates))
      geometry.coordinates.forEach(addPolygon);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.computeBoundingSphere();
  return geometry;
}

export function createCountryBoundaryLayer(
  globe: GlobeMethods,
  countries: CountryFeature[],
  detailed = false
) {
  const geometry = createCountryBoundaryGeometry(globe, countries);
  const material = new LineBasicMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    toneMapped: false,
  });
  const boundary = new LineSegments(geometry, material);
  boundary.name = 'country-boundaries';
  boundary.renderOrder = 2;
  boundary.raycast = () => {};
  globe.scene().add(boundary);

  function updateSurface() {
    if (document.hidden) return;
    const altitude = Math.min(
      getSurfaceAltitude(globe.pointOfView().altitude),
      detailed ? 0.000003 : 0.002
    );
    const scale = 1 + altitude;
    if (boundary.scale.x !== scale) boundary.scale.setScalar(scale);
  }

  function visibility() {
    boundary.visible = !document.hidden;
    if (boundary.visible) updateSurface();
  }

  globe.controls().addEventListener('change', updateSurface);
  document.addEventListener('visibilitychange', visibility);
  visibility();
  return {
    setDetailed(value: boolean) {
      if (detailed === value) return;
      detailed = value;
      updateSurface();
    },
    dispose() {
      globe.controls().removeEventListener('change', updateSurface);
      document.removeEventListener('visibilitychange', visibility);
      globe.scene().remove(boundary);
      geometry.dispose();
      material.dispose();
    },
  };
}
