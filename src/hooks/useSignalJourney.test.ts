import { act, cleanup, renderHook } from '@testing-library/react';
import type { RadioStation } from '../types/radio';
import { createStation } from '../test/fixtures';
import { useSignalJourney } from './useSignalJourney';

const stationAt = (index: number, overrides: Partial<RadioStation> = {}) =>
  createStation({
    stationuuid: `journey-${index}`,
    name: `Station ${index}`,
    geo_lat: index,
    geo_long: index,
    ...overrides,
  });

describe('signal journey navigation', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('starts with at most six unique healthy stations and selects only the first stop', () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() => useSignalJourney(onSelect));
    const healthy = Array.from({ length: 9 }, (_, index) => stationAt(index));
    const input = [
      stationAt(20, { lastcheckok: 0 }),
      stationAt(21, { geo_lat: null }),
      stationAt(22, { geo_long: 181 }),
      stationAt(23, { url: '', url_resolved: 'javascript:alert(1)' }),
      healthy[0],
      { ...healthy[0], name: 'Duplicate station metadata' },
      ...healthy.slice(1),
    ];
    act(() => result.current.start(input));
    expect(result.current.route).toEqual(healthy.slice(0, 6));
    expect(result.current.index).toBe(0);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(healthy[0]);
  });

  it('does not start playback when no eligible stations are available', () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() => useSignalJourney(onSelect));
    act(() => result.current.start([]));
    act(() => result.current.start([stationAt(1, { lastcheckok: 0 }), createStation()]));
    expect(result.current.route).toEqual([]);
    expect(result.current.index).toBe(0);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('ignores invalid route indexes without changing playback or the current stop', () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() => useSignalJourney(onSelect));
    const route = [stationAt(1), stationAt(2)];
    act(() => result.current.start(route));
    onSelect.mockClear();
    for (const index of [-1, 2, 99, 0.5, NaN, Infinity, -Infinity]) {
      act(() => result.current.goTo(index));
    }
    expect(result.current.index).toBe(0);
    expect(result.current.route).toEqual(route);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('advances and goes back only through explicit navigation calls and stops at both ends', () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() => useSignalJourney(onSelect));
    const route = [stationAt(1), stationAt(2), stationAt(3)];
    act(() => result.current.start(route));
    expect(result.current.previous).toBeUndefined();
    act(() => result.current.next?.());
    expect(result.current.index).toBe(1);
    act(() => result.current.next?.());
    expect(result.current.index).toBe(2);
    expect(result.current.next).toBeUndefined();
    act(() => result.current.previous?.());
    expect(result.current.index).toBe(1);
    act(() => result.current.previous?.());
    expect(result.current.index).toBe(0);
    expect(result.current.previous).toBeUndefined();
    expect(onSelect.mock.calls.map(([station]) => station.stationuuid)).toEqual([
      'journey-1',
      'journey-2',
      'journey-3',
      'journey-2',
      'journey-1',
    ]);
  });

  it('never starts a timer or changes the station merely because time has passed', () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();
    const { result } = renderHook(() => useSignalJourney(onSelect));
    act(() => result.current.start([stationAt(1), stationAt(2), stationAt(3)]));
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(3_600_000));
    expect(result.current.index).toBe(0);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('follows manual selection within the route by identity without selecting the station again', () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() => useSignalJourney(onSelect));
    const route = [stationAt(1), stationAt(2), stationAt(3)];
    act(() => result.current.start(route));
    onSelect.mockClear();
    act(() => result.current.followStation({ ...route[2], name: 'Updated metadata' }));
    expect(result.current.index).toBe(2);
    expect(result.current.route).toEqual(route);
    expect(result.current.next).toBeUndefined();
    expect(result.current.previous).toBeDefined();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('ends the route when a different station is selected without interrupting that selection', () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() => useSignalJourney(onSelect));
    act(() => result.current.start([stationAt(1), stationAt(2)]));
    onSelect.mockClear();
    act(() => result.current.followStation(stationAt(99)));
    expect(result.current.route).toEqual([]);
    expect(result.current.index).toBe(0);
    expect(result.current.previous).toBeUndefined();
    expect(result.current.next).toBeUndefined();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('ending or unmounting a journey preserves the currently selected audio station', () => {
    const onSelect = vi.fn();
    const { result, unmount } = renderHook(() => useSignalJourney(onSelect));
    act(() => result.current.start([stationAt(1), stationAt(2)]));
    act(() => result.current.next?.());
    expect(onSelect).toHaveBeenLastCalledWith(stationAt(2));
    const previousCalls = onSelect.mock.calls.slice();
    act(() => result.current.end());
    expect(result.current.route).toEqual([]);
    expect(result.current.index).toBe(0);
    act(() => result.current.goTo(0));
    unmount();
    expect(onSelect.mock.calls).toEqual(previousCalls);
  });

  it('a new explicitly started journey replaces the old route and resets its position', () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() => useSignalJourney(onSelect));
    act(() => result.current.start([stationAt(1), stationAt(2)]));
    act(() => result.current.next?.());
    const route = [stationAt(10), stationAt(11)];
    act(() => result.current.start(route));
    expect(result.current.route).toEqual(route);
    expect(result.current.index).toBe(0);
    expect(onSelect).toHaveBeenLastCalledWith(route[0]);
  });
});
