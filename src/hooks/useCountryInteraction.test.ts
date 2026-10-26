import { act, cleanup, renderHook } from '@testing-library/react';
import { EventDispatcher, PerspectiveCamera } from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import type { CountryFeature } from '../lib/countries';
import { useCountryInteraction } from './useCountryInteraction';

const france: CountryFeature = {
  type: 'Feature',
  properties: { NAME_EN: 'France' },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [-5, 40],
        [-5, 52],
        [10, 52],
        [10, 40],
        [-5, 40],
      ],
    ],
  },
};

describe('country interaction', () => {
  let canvas: HTMLCanvasElement;
  let globeRef: { current: GlobeMethods };

  beforeEach(() => {
    vi.useFakeTimers();
    canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
    } as DOMRect);
    const camera = new PerspectiveCamera(60, 800 / 600, 0.05, 1000);
    camera.position.set(0, 0, 200);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    globeRef = {
      current: {
        renderer: () => ({ domElement: canvas }),
        controls: () => new EventDispatcher(),
        camera: () => camera,
        getGlobeRadius: () => 100,
        toGeoCoords: () => ({ lat: 48, lng: 2, altitude: 0 }),
      } as unknown as GlobeMethods,
    };
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function dispatch(type: string, clientX = 400, clientY = 300) {
    const event = new PointerEvent(type, { clientX, clientY, button: 0, pointerType: 'mouse' });
    canvas.dispatchEvent(event);
    return event;
  }

  it('highlights on hover and opens a country only after a click', async () => {
    const hover = vi.fn();
    const select = vi.fn();
    renderHook(() => useCountryInteraction(globeRef, true, [france], hover, select));
    act(() => {
      dispatch('pointermove');
      vi.advanceTimersByTime(100);
    });
    expect(hover).toHaveBeenCalledWith(france);
    expect(select).not.toHaveBeenCalled();
    await act(async () => {
      dispatch('pointerdown');
      dispatch('pointerup');
      await Promise.resolve();
    });
    expect(select).toHaveBeenCalledWith(france, expect.any(PointerEvent));
  });

  it('does not open a country after dragging or clicking outside the globe', async () => {
    const select = vi.fn();
    renderHook(() => useCountryInteraction(globeRef, true, [france], vi.fn(), select));
    await act(async () => {
      dispatch('pointerdown');
      dispatch('pointerup', 430);
      dispatch('pointerdown', -1000, -1000);
      dispatch('pointerup', -1000, -1000);
      await Promise.resolve();
    });
    expect(select).not.toHaveBeenCalled();
  });

  it('allows a station click handler to take priority before opening a country', async () => {
    let stationEvent: Event | null = null;
    const select = vi.fn((_: CountryFeature, event: PointerEvent) => {
      expect(event).toBe(stationEvent);
    });
    renderHook(() => useCountryInteraction(globeRef, true, [france], vi.fn(), select));
    canvas.addEventListener('pointerup', (event) => {
      stationEvent = event;
    });
    await act(async () => {
      dispatch('pointerdown');
      dispatch('pointerup');
      await Promise.resolve();
    });
    expect(select).toHaveBeenCalledOnce();
  });

  it('cancels queued hover and click callbacks when the globe unmounts', async () => {
    const hover = vi.fn();
    const select = vi.fn();
    const { unmount } = renderHook(() =>
      useCountryInteraction(globeRef, true, [france], hover, select)
    );
    dispatch('pointermove');
    dispatch('pointerdown');
    dispatch('pointerup');
    unmount();
    await Promise.resolve();
    act(() => vi.runAllTimers());
    expect(hover).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
