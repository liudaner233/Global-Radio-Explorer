import { act, cleanup, renderHook } from '@testing-library/react';
import { createStation } from '../test/fixtures';
import { LISTENING_PASSPORT_STORAGE_KEY, readListeningPassport } from '../lib/listeningPassport';
import { useListeningPassport } from './useListeningPassport';

describe('listening passport progress lifecycle', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-02T12:00:00Z'));
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('never adds listening time without actual progress calls', () => {
    const { result } = renderHook(() => useListeningPassport());
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.passport.totalSeconds).toBe(0);
    expect(result.current.passport.recent).toEqual([]);
    expect(localStorage.getItem(LISTENING_PASSPORT_STORAGE_KEY)).toBeNull();
  });

  it('publishes first progress immediately and batches subsequent updates with a stable callback', () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useListeningPassport();
    });
    const record = result.current.recordListening;
    const station = createStation();
    act(() => record(station, 0.5));
    expect(result.current.passport.totalSeconds).toBe(0.5);
    expect(result.current.passport.recent).toHaveLength(1);
    expect(result.current.recordListening).toBe(record);
    const initialRenders = renders;
    for (let index = 0; index < 12; index++) {
      act(() => {
        record(station, 0.25);
        vi.advanceTimersByTime(250);
      });
    }
    expect(renders).toBe(initialRenders);
    expect(result.current.passport.totalSeconds).toBe(0.5);
    act(() => vi.advanceTimersByTime(2_000));
    expect(result.current.passport.totalSeconds).toBe(3.5);
    expect(readListeningPassport().totalSeconds).toBe(3.5);
    expect(renders).toBe(initialRenders + 1);
  });

  it('publishes station changes immediately and revisiting a country keeps a single stamp', () => {
    const { result } = renderHook(() => useListeningPassport());
    const first = createStation({ stationuuid: 'first', country: 'France', countrycode: 'FR' });
    const next = createStation({ stationuuid: 'next', country: 'Japan', countrycode: 'JP' });
    act(() => {
      result.current.recordListening(first, 1);
      vi.advanceTimersByTime(1_000);
      result.current.recordListening(next, 2);
    });
    expect(result.current.passport.totalSeconds).toBe(3);
    expect(result.current.passport.countries).toHaveLength(2);
    expect(result.current.passport.recent[0].station.stationuuid).toBe('next');
    act(() => {
      vi.advanceTimersByTime(1_000);
      result.current.recordListening(first, 4);
    });
    expect(result.current.passport.totalSeconds).toBe(7);
    expect(result.current.passport.countries).toHaveLength(2);
    expect(result.current.passport.recent[0]).toMatchObject({ id: 'id:first', seconds: 5 });
  });

  it('flushes pending listening before leaving the page', () => {
    const { result } = renderHook(() => useListeningPassport());
    act(() => {
      result.current.recordListening(createStation(), 1);
      result.current.recordListening(createStation(), 2);
    });
    expect(readListeningPassport().totalSeconds).toBe(1);
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(readListeningPassport().totalSeconds).toBe(3);
    expect(result.current.passport.totalSeconds).toBe(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('flushes when hidden and on unmount and cleans up all pending work', () => {
    const { result, unmount } = renderHook(() => useListeningPassport());
    act(() => {
      result.current.recordListening(createStation(), 1);
      result.current.recordListening(createStation(), 2);
    });
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(readListeningPassport().totalSeconds).toBe(3);
    act(() => result.current.recordListening(createStation(), 4));
    unmount();
    expect(readListeningPassport().totalSeconds).toBe(7);
    expect(vi.getTimerCount()).toBe(0);
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(readListeningPassport().totalSeconds).toBe(7);
  });

  it('clears stored and pending data without letting a scheduled flush bring it back', () => {
    const { result } = renderHook(() => useListeningPassport());
    act(() => {
      result.current.recordListening(createStation(), 1);
      result.current.recordListening(createStation(), 2);
      result.current.clearPassport();
    });
    expect(result.current.passport.totalSeconds).toBe(0);
    expect(result.current.passport.recent).toEqual([]);
    expect(localStorage.getItem(LISTENING_PASSPORT_STORAGE_KEY)).toBeNull();
    act(() => vi.advanceTimersByTime(10_000));
    expect(localStorage.getItem(LISTENING_PASSPORT_STORAGE_KEY)).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    act(() => result.current.recordListening(createStation(), 1));
    expect(result.current.passport.totalSeconds).toBe(1);
  });

  it('continues in memory if storage is disabled', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Storage disabled', 'SecurityError');
    });
    const { result, unmount } = renderHook(() => useListeningPassport());
    act(() => result.current.recordListening(createStation(), 2));
    expect(result.current.passport.totalSeconds).toBe(2);
    act(() => result.current.clearPassport());
    expect(result.current.passport.totalSeconds).toBe(0);
    expect(() => unmount()).not.toThrow();
  });
});
