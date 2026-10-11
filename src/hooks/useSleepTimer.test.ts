import { act, cleanup, renderHook } from '@testing-library/react';
import { useSleepTimer } from './useSleepTimer';

describe('sleep timer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-02T12:00:00Z'));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('creates an absolute deadline and stays idle until a timer is selected', () => {
    const { result } = renderHook(() => useSleepTimer(vi.fn()));
    expect(result.current.deadline).toBeNull();
    expect(result.current.remainingMs).toBeNull();
    expect(result.current.fadeFactor).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
    const start = Date.now();
    act(() => result.current.setTimer(15));
    expect(result.current.deadline).toBe(start + 15 * 60_000);
    expect(result.current.remainingMs).toBe(15 * 60_000);
    act(() => vi.advanceTimersByTime(5_000));
    expect(result.current.remainingMs).toBe(15 * 60_000 - 5_000);
    expect(result.current.deadline).toBe(start + 15 * 60_000);
    expect(result.current.fadeFactor).toBe(1);
  });

  it('eases the volume down only during the final thirty seconds', () => {
    const { result } = renderHook(() => useSleepTimer(vi.fn()));
    act(() => result.current.setTimer(1));
    act(() => vi.advanceTimersByTime(30_000));
    expect(result.current.fadeFactor).toBe(1);
    act(() => vi.advanceTimersByTime(15_000));
    expect(result.current.remainingMs).toBe(15_000);
    expect(result.current.fadeFactor).toBeCloseTo(0.5);
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current.fadeFactor).toBeGreaterThan(0);
    expect(result.current.fadeFactor).toBeLessThan(0.1);
  });

  it('expires once at the actual deadline and removes scheduled work', () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() => useSleepTimer(onExpire));
    act(() => result.current.setTimer(0.025));
    act(() => vi.advanceTimersByTime(1_499));
    expect(onExpire).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(result.current.deadline).toBeNull();
    expect(result.current.remainingMs).toBeNull();
    expect(result.current.fadeFactor).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
      vi.advanceTimersByTime(60_000);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('checks elapsed wall time when a throttled background page returns', () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() => useSleepTimer(onExpire));
    act(() => result.current.setTimer(1));
    act(() => {
      vi.setSystemTime(Date.now() + 90_000);
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current.deadline).toBeNull();
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels an active fade and restores volume immediately', () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() => useSleepTimer(onExpire));
    act(() => result.current.setTimer(1));
    act(() => vi.advanceTimersByTime(45_000));
    expect(result.current.fadeFactor).toBeCloseTo(0.5);
    act(() => result.current.setTimer(null));
    expect(result.current.fadeFactor).toBe(1);
    expect(result.current.deadline).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(60_000));
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('keeps the deadline when callbacks change and uses the latest callback', () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { result, rerender } = renderHook(({ callback }) => useSleepTimer(callback), {
      initialProps: { callback: first },
    });
    act(() => result.current.setTimer(1));
    const deadline = result.current.deadline;
    act(() => vi.advanceTimersByTime(15_000));
    rerender({ callback: latest });
    expect(result.current.deadline).toBe(deadline);
    act(() => vi.advanceTimersByTime(45_000));
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });

  it('ignores invalid durations and cleans timers and listeners on unmount', () => {
    const onExpire = vi.fn();
    const { result, unmount } = renderHook(() => useSleepTimer(onExpire));
    act(() => result.current.setTimer(15));
    const deadline = result.current.deadline;
    act(() => {
      for (const minutes of [-1, 0, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_VALUE]) {
        result.current.setTimer(minutes);
      }
    });
    expect(result.current.deadline).toBe(deadline);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    act(() => {
      vi.setSystemTime(Date.now() + 90 * 60_000);
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
    expect(onExpire).not.toHaveBeenCalled();
  });
});
