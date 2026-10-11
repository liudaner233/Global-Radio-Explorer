import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createStation } from '../test/fixtures';
import { useStationCatalog } from './useStationCatalog';
import { saveCatalogCache } from '../lib/stationCatalogCache';

const response = (name: string) =>
  new Response(JSON.stringify([createStation({ name, stationuuid: name })]));

describe('station categories', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('queries the selected genre, caches category lists and combines genre with search', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const params = new URL(String(input)).searchParams;
      return response(`${params.get('tag') || 'all'}:${params.get('name') || 'trending'}`);
    });
    const { result } = renderHook(useStationCatalog);
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.changeGenre('jazz'));
    await waitFor(() => expect(result.current.stations[0]?.name).toBe('jazz:trending'));
    act(() => result.current.changeGenre('all'));
    expect(result.current.stations[0].name).toBe('all:trending');
    act(() => result.current.changeGenre('jazz'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    act(() => result.current.changeQuery('night'));
    await waitFor(() => expect(result.current.stations[0]?.name).toBe('jazz:night'));
    act(() => result.current.changeGenre('rock'));
    await waitFor(() => expect(result.current.stations[0]?.name).toBe('rock:night'));
    const query = new URL(String(fetchMock.mock.calls.at(-1)![0])).searchParams;
    expect(query.get('tag')).toBe('rock');
    expect(query.get('name')).toBe('night');
    expect(result.current.query).toBe('night');
  });

  it('cancels obsolete genre requests and ignores late results', async () => {
    let resolveJazz: (value: Response) => void = () => {};
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const tag = new URL(String(input)).searchParams.get('tag');
      if (tag === 'jazz')
        return new Promise<Response>((resolve) => {
          resolveJazz = resolve;
        });
      return response(tag || 'all');
    });
    const { result } = renderHook(useStationCatalog);
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.changeGenre('jazz'));
    act(() => result.current.changeGenre('news'));
    expect(fetchMock.mock.calls[1][1]?.signal?.aborted).toBe(true);
    await waitFor(() => expect(result.current.stations[0]?.name).toBe('news'));
    await act(async () => resolveJazz(response('stale jazz')));
    expect(result.current.stations[0].name).toBe('news');
  });

  it('shows a recent saved catalog immediately and refreshes it in the background', async () => {
    saveCatalogCache([createStation({ name: 'Saved FM' })]);
    let resolve: (value: Response) => void = () => {};
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        })
    );
    const { result } = renderHook(useStationCatalog);
    expect(result.current.initializing).toBe(true);
    expect(result.current.stations[0].name).toBe('Saved FM');
    await act(async () => resolve(response('Fresh FM')));
    expect(result.current.stations[0].name).toBe('Fresh FM');
    expect(result.current.initializing).toBe(false);
  });

  it('retains saved stations after a failed startup refresh without presenting old genre results', async () => {
    saveCatalogCache([createStation({ name: 'Saved FM' })]);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Offline'));
    const { result } = renderHook(useStationCatalog);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.stations[0].name).toBe('Saved FM');
    expect(result.current.error).toBe('Offline');
    act(() => result.current.changeGenre('jazz'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.stations).toEqual([]);
  });

  it('reuses recent search results while keeping explicit search refresh available', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const name = new URL(String(input)).searchParams.get('name');
      return response(name || 'all');
    });
    const { result } = renderHook(useStationCatalog);
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.changeQuery('jazz'));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.stations[0]?.name).toBe('jazz'));
    act(() => result.current.changeQuery(''));
    act(() => result.current.changeQuery('jazz'));
    expect(result.current.loading).toBe(false);
    expect(result.current.stations[0].name).toBe('jazz');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    act(() => result.current.submitSearch());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each(['nearby', 'discover'] as const)(
    'keeps %s browsing and its categories local, then queries the selected category on returning',
    async (tab) => {
      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async (input) =>
          response(new URL(String(input)).searchParams.get('tag') || 'all')
        );
      const { result } = renderHook(useStationCatalog);
      await waitFor(() => expect(result.current.loading).toBe(false));
      act(() => result.current.changeTab(tab));
      act(() => result.current.changeGenre('jazz'));
      expect(result.current.tab).toBe(tab);
      expect(result.current.genre).toBe('jazz');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      act(() => result.current.changeTab('trending'));
      await waitFor(() => expect(result.current.stations[0]?.name).toBe('jazz'));
      expect(fetchMock).toHaveBeenCalledTimes(2);
    }
  );

  it.each(['nearby', 'discover'] as const)(
    'retains the loaded catalog when %s changes an uncached category until Trending is requested',
    async (tab) => {
      const jazz = createStation({
        stationuuid: 'jazz-paris',
        name: 'Paris Jazz',
        tags: 'jazz',
        geo_lat: 48.86,
        geo_long: 2.35,
      });
      const ambient = createStation({
        stationuuid: 'ambient-berlin',
        name: 'Berlin Ambient',
        tags: 'ambient',
        geo_lat: 52.52,
        geo_long: 13.4,
      });
      let resolveJazz: (value: Response) => void = () => {};
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        if (new URL(String(input)).searchParams.get('tag') === 'jazz') {
          return new Promise<Response>((resolve) => {
            resolveJazz = resolve;
          });
        }
        return new Response(JSON.stringify([jazz, ambient]));
      });
      const { result } = renderHook(useStationCatalog);
      await waitFor(() => expect(result.current.loading).toBe(false));
      const loadedCatalog = result.current.stations;

      act(() => result.current.changeTab(tab));
      act(() => result.current.changeGenre('jazz'));
      expect(result.current.stations).toBe(loadedCatalog);
      act(() => result.current.changeGenre('rock'));
      expect(result.current.stations).toBe(loadedCatalog);
      act(() => result.current.changeGenre('jazz'));
      expect(result.current.stations).toBe(loadedCatalog);
      expect(result.current.genre).toBe('jazz');
      expect(result.current.tab).toBe(tab);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      act(() => result.current.changeTab('trending'));
      expect(result.current.loading).toBe(true);
      expect(result.current.stations).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get('tag')).toBe('jazz');
      await act(async () => resolveJazz(new Response(JSON.stringify([jazz]))));
      expect(result.current.loading).toBe(false);
      expect(result.current.stations).toEqual([jazz]);
    }
  );

  it('discards malformed stations and normalizes optional API fields', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          null,
          10,
          { stationuuid: 'valid', name: 'Minimal FM', url: 'https://example.com/live', tags: 12 },
        ])
      )
    );
    const { result } = renderHook(useStationCatalog);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.stations).toHaveLength(1);
    expect(result.current.stations[0]).toMatchObject({
      name: 'Minimal FM',
      tags: '',
      country: '',
      geo_lat: null,
    });
  });
});
