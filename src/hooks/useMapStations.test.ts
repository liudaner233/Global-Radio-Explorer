import { act, cleanup, renderHook } from '@testing-library/react';
import { useMapStations } from './useMapStations';
import { createStation } from '../test/fixtures';

const station = (id: string) => createStation({ stationuuid: id, geo_lat: 20, geo_long: 10 });
const response = (stations: ReturnType<typeof createStation>[]) =>
  new Response(JSON.stringify(stations));
const startRequest = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(700);
  });
};

describe('map stations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(8);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('loads geographic stations separately and preserves them after a catalog search', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response([station('map')]));
    const { result, rerender } = renderHook(({ catalog }) => useMapStations(true, catalog), {
      initialProps: { catalog: [station('catalog')] },
    });
    expect(result.current).toHaveLength(1);
    await startRequest();
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get('has_geo_info')).toBe('true');
    expect(url.searchParams.get('hidebroken')).toBe('true');
    expect(url.searchParams.get('is_https')).toBe('true');
    expect(url.searchParams.get('limit')).toBe('1000');
    expect(result.current.map((s) => s.stationuuid)).toEqual(['catalog', 'map']);
    rerender({ catalog: [] });
    expect(result.current.map((s) => s.stationuuid)).toEqual(['map']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('deduplicates pages, filters invalid signals and uses raw page offsets', async () => {
    const first = Array.from({ length: 1000 }, (_, index) => station(`map-${index}`));
    first[999] = createStation({ stationuuid: 'no-coordinates' });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(first))
      .mockResolvedValueOnce(
        response([first[0], station('second-page'), station('selected'), station('catalog')])
      );
    const selected = station('selected');
    const { result } = renderHook(() => useMapStations(true, [station('catalog')], selected));
    await startRequest();
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get('offset')).toBe('1000');
    expect(result.current).toHaveLength(1002);
    expect(result.current[0]).toBe(selected);
    expect(result.current.every((s) => Number.isFinite(s.geo_lat))).toBe(true);
  });

  it('keeps already loaded nodes if a later page fails', async () => {
    const first = Array.from({ length: 1000 }, (_, index) => station(`map-${index}`));
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(first))
      .mockRejectedValue(new Error('Offline'));
    const { result } = renderHook(() => useMapStations(true, []));
    await startRequest();
    expect(result.current).toHaveLength(1000);
  });

  it('waits for the globe and cancels pending requests on unmount', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_input, options) =>
        new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(options.signal?.reason));
        })
    );
    const { rerender, unmount } = renderHook(({ enabled }) => useMapStations(enabled, []), {
      initialProps: { enabled: false },
    });
    await startRequest();
    expect(fetchMock).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await startRequest();
    await act(async () => unmount());
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reduces the download budget on devices with fewer CPU cores', async () => {
    vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(2);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      const offset = Number(url.searchParams.get('offset'));
      return response(
        Array.from({ length: Number(url.searchParams.get('limit')) }, (_, index) =>
          station(`map-${offset + index}`)
        )
      );
    });
    const { result } = renderHook(() => useMapStations(true, []));
    await startRequest();
    expect(result.current).toHaveLength(2500);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const final = new URL(String(fetchMock.mock.calls[2][0]));
    expect(final.searchParams.get('limit')).toBe('500');
    expect(final.searchParams.get('offset')).toBe('2000');
  });
});
