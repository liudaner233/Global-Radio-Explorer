import { EventDispatcher, LineSegments, Scene } from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import type { CountryFeature } from './countries';
import { createCountryBoundaryGeometry, createCountryBoundaryLayer } from './countryBoundaryLayer';

const coordinates = {
  getGlobeRadius: () => 100,
  getCoords(lat: number, lng: number) {
    const phi = (lat * Math.PI) / 180;
    const theta = (lng * Math.PI) / 180;
    return {
      x: 100 * Math.cos(phi) * Math.sin(theta),
      y: 100 * Math.sin(phi),
      z: 100 * Math.cos(phi) * Math.cos(theta),
    };
  },
};

function polygon(ring: number[][]): CountryFeature {
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] } };
}

it('follows the short spherical path across the date line', () => {
  const geometry = createCountryBoundaryGeometry(coordinates, [
    polygon([
      [179, 0],
      [-179, 0],
      [-179, 1],
      [179, 0],
    ]),
  ]);
  const positions = geometry.getAttribute('position');
  for (let index = 0; index < positions.count; index++) {
    expect(positions.getZ(index)).toBeLessThan(-99);
    expect(
      Math.hypot(positions.getX(index), positions.getY(index), positions.getZ(index))
    ).toBeCloseTo(100, 4);
  }
  geometry.dispose();
});

it('shares a single copy of adjacent country borders and includes island and hole rings', () => {
  const first = polygon([
    [0, 0],
    [0, 1],
    [1, 1],
    [1, 0],
    [0, 0],
  ]);
  const second = polygon([
    [1, 0],
    [1, 1],
    [2, 1],
    [2, 0],
    [1, 0],
  ]);
  const a = createCountryBoundaryGeometry(coordinates, [first]);
  const b = createCountryBoundaryGeometry(coordinates, [second]);
  const shared = createCountryBoundaryGeometry(coordinates, [first, second]);
  expect(shared.getAttribute('position').count).toBeLessThan(
    a.getAttribute('position').count + b.getAttribute('position').count
  );
  const island: CountryFeature = {
    type: 'Feature',
    geometry: {
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [10, 0],
            [10, 1],
            [11, 0],
            [10, 0],
          ],
          [
            [10.1, 0.1],
            [10.1, 0.2],
            [10.2, 0.1],
            [10.1, 0.1],
          ],
        ],
      ],
    },
  };
  const all = createCountryBoundaryGeometry(coordinates, [first, second, island]);
  expect(all.getAttribute('position').count).toBeGreaterThan(shared.getAttribute('position').count);
  for (const geometry of [a, b, shared, all]) geometry.dispose();
});

it('keeps one noninteractive boundary mesh and reuses its geometry during zoom', () => {
  const scene = new Scene();
  const controls = new EventDispatcher<{ change: object }>();
  let altitude = 1.45;
  const globe = {
    ...coordinates,
    scene: () => scene,
    controls: () => controls,
    pointOfView: () => ({ altitude }),
  } as unknown as GlobeMethods;
  const layer = createCountryBoundaryLayer(globe, [
    polygon([
      [0, 0],
      [0, 1],
      [1, 0],
    ]),
  ]);
  const mesh = scene.getObjectByName('country-boundaries') as LineSegments;
  const geometry = mesh.geometry;
  const hits: unknown[] = [];
  mesh.raycast(null!, hits as never[]);
  expect(hits).toHaveLength(0);
  expect(scene.children).toHaveLength(1);
  altitude = 0.001;
  controls.dispatchEvent({ type: 'change' });
  layer.setDetailed(true);
  expect(mesh.geometry).toBe(geometry);
  expect(mesh.scale.x).toBeCloseTo(1.000003, 6);
  const dispose = vi.spyOn(geometry, 'dispose');
  layer.dispose();
  expect(dispose).toHaveBeenCalledOnce();
  expect(scene.children).toHaveLength(0);
});
