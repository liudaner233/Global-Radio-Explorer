import { act, renderHook } from '@testing-library/react';
import { useCountryStations } from './useCountryStations';
import type { CountryFeature } from '../lib/countries';
import { createStation } from '../test/fixtures';

const france: CountryFeature = {
  type: 'Feature',
  properties: { NAME_EN: 'France', ISO_A2: '-99', ISO_A2_EH: 'FR' },
};
const germany: CountryFeature = {
  type: 'Feature',
  properties: { NAME_EN: 'Germany', ISO_A2: 'DE' },
};
const response = (stations = [createStation({ name: 'Country FM' })]) =>
  new Response(JSON.stringify(stations));
const startRequest = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250);
  });
};

describe('country station queries', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('queries the country code even when the main map has no stations', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response());
    const { result } = renderHook(() => useCountryStations(france));
    expect(result.current.loading).toBe(true);
    await startRequest();
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get('countrycode')).toBe('FR');
    expect(url.searchParams.get('limit')).toBe('50');
    expect(url.searchParams.get('hidebroken')).toBe('true');
    expect(url.searchParams.get('is_https')).toBe('true');
    expect(result.current.stations[0].name).toBe('Country FM');
    expect(result.current.loading).toBe(false);
  });

  it('falls back to an exact country name and rejects unidentified regions', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => response([]));
    const { result, rerender } = renderHook(({ country }) => useCountryStations(country), {
      initialProps: {
        country: {
          type: 'Feature',
          properties: { NAME_EN: 'France', ISO_A2: '-99' },
        } as CountryFeature,
      },
    });
    await startRequest();
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get('country')).toBe('France');
    expect(url.searchParams.get('countryExact')).toBe('true');
    expect(url.searchParams.has('countrycode')).toBe(false);
    rerender({ country: { type: 'Feature' } });
    await startRequest();
    expect(result.current.error).toMatch(/no country information/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('appends pages and removes duplicates without corrupting the request offset', async () => {
    const firstPage = Array.from({ length: 50 }, (_, index) =>
      createStation({ stationuuid: `fr-${index}` })
    );
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(firstPage))
      .mockResolvedValueOnce(response([firstPage[0], createStation({ stationuuid: 'fr-new' })]));
    const { result } = renderHook(() => useCountryStations(france));
    await startRequest();
    expect(result.current.hasMore).toBe(true);
    await act(async () => {
      await result.current.loadMore();
    });
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get('offset')).toBe('50');
    expect(result.current.stations).toHaveLength(51);
    expect(result.current.offset).toBe(52);
    expect(result.current.hasMore).toBe(false);
  });

  it('cancels an old country request and ignores its late response', async () => {
    let resolveOld: (response: Response) => void;
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveOld = resolve;
          })
      )
      .mockResolvedValueOnce(response([createStation({ name: 'German FM' })]));
    const { result, rerender } = renderHook(({ country }) => useCountryStations(country), {
      initialProps: { country: france },
    });
    await startRequest();
    rerender({ country: germany });
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(result.current.stations).toHaveLength(0);
    await startRequest();
    await act(async () => {
      resolveOld(response([createStation({ name: 'French FM' })]));
    });
    expect(result.current.stations[0].name).toBe('German FM');
  });

  it('reuses cached results after closing and reloads expired results', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => response());
    const { result, rerender } = renderHook(
      ({ country }: { country: CountryFeature | null }) => useCountryStations(country),
      { initialProps: { country: france } }
    );
    await startRequest();
    rerender({ country: null });
    expect(result.current.stations).toHaveLength(0);
    rerender({ country: france });
    expect(result.current.stations).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    rerender({ country: null });
    vi.setSystemTime(Date.now() + 300001);
    rerender({ country: france });
    await startRequest();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('cancels a page request when closing a cached country', async () => {
    const firstPage = Array.from({ length: 50 }, (_, index) =>
      createStation({ stationuuid: `fr-${index}` })
    );
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(firstPage))
      .mockImplementationOnce(() => new Promise<Response>(() => undefined));
    const { result, rerender } = renderHook(
      ({ country }: { country: CountryFeature | null }) => useCountryStations(country),
      { initialProps: { country: france } }
    );
    await startRequest();
    rerender({ country: null });
    rerender({ country: france });
    act(() => {
      void result.current.loadMore();
    });
    rerender({ country: null });
    expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);
  });

  it('distinguishes a failed request from an empty result and supports retry', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Offline'));
    const { result } = renderHook(() => useCountryStations(france));
    await startRequest();
    expect(result.current.error).toBe('Offline');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    fetchMock.mockResolvedValue(response([]));
    await act(async () => {
      await result.current.retry();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.stations).toHaveLength(0);
    expect(result.current.hasMore).toBe(false);
  });
});
