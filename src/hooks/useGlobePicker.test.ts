import { act, cleanup, renderHook } from '@testing-library/react';
import { EventDispatcher, PerspectiveCamera } from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import { createStation } from '../test/fixtures';
import { useGlobePicker } from './useGlobePicker';

describe('globe center picker', () => {
  let controls: EventDispatcher<{ change: object; start: object; end: object }>;
  let camera: PerspectiveCamera;
  let globeRef: { current: GlobeMethods };

  beforeEach(() => {
    vi.useFakeTimers();
    camera = new PerspectiveCamera(60, 800 / 600, 0.05, 1000);
    camera.position.set(0, 0, 200);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    controls = new EventDispatcher();
    globeRef = {
      current: {
        controls: () => controls,
        renderer: () => ({ domElement: { clientWidth: 800, clientHeight: 600 } }),
        camera: () => camera,
        pointOfView: () => ({ altitude: 1.45 }),
        getGlobeRadius: () => 100,
        getCoords: (lat: number, lng: number) => ({
          x: (lng * 100) / (300 / Math.tan(Math.PI / 6)),
          y: 0,
          z: lat < 0 ? -100 : 100,
        }),
      } as unknown as GlobeMethods,
    };
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('chooses the closest front-facing station inside the circle', () => {
    const stations = [
      createStation({ stationuuid: 'behind', geo_lat: -20, geo_long: 0 }),
      createStation({ stationuuid: 'edge', geo_lat: 20, geo_long: 30 }),
      createStation({ stationuuid: 'closest', geo_lat: 20, geo_long: 4 }),
      createStation({ stationuuid: 'outside', geo_lat: 20, geo_long: 50 }),
    ];
    const { result } = renderHook(() => useGlobePicker(globeRef, true, stations));
    expect(result.current.station?.stationuuid).toBe('closest');
  });

  it('leaves the picker empty for distant or back-facing stations', () => {
    const stations = [
      createStation({ geo_lat: -20, geo_long: 0 }),
      createStation({ stationuuid: 'outside', geo_lat: 20, geo_long: 50 }),
    ];
    const { result } = renderHook(() => useGlobePicker(globeRef, true, stations));
    expect(result.current.station).toBeNull();
  });

  it('updates after a drag and removes pending work on unmount', () => {
    const stations = [createStation({ geo_lat: 20, geo_long: 0 })];
    const { result, unmount } = renderHook(() => useGlobePicker(globeRef, true, stations));
    expect(result.current.station).toBe(stations[0]);
    act(() => {
      controls.dispatchEvent({ type: 'start' });
      camera.position.x = 20;
      camera.updateMatrixWorld();
      controls.dispatchEvent({ type: 'change' });
      vi.advanceTimersByTime(80);
    });
    expect(result.current.moving).toBe(true);
    expect(result.current.station).toBeNull();
    act(() => controls.dispatchEvent({ type: 'end' }));
    expect(result.current.moving).toBe(false);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
