import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchInitialStations,
  fetchTrendingStations,
  getReadableErrorMessage,
  searchStationsByName,
} from '../lib/radioApi';
import type { RadioStation } from '../types/radio';
import { getStationGenre, type StationGenre } from '../lib/stationGenres';
import { readCatalogCache, saveCatalogCache } from '../lib/stationCatalogCache';

type CatalogTab = 'trending' | 'search' | 'nearby' | 'discover';
type RequestMode = 'trending' | 'search' | 'initial';

interface CatalogRequest {
  genre: StationGenre;
  mode: RequestMode;
  query: string;
  loading: boolean;
  error: string | null;
}

const searchKey = (value: string, category: StationGenre) => `${category}:${value.toLowerCase()}`;

export function useStationCatalog() {
  const [cachedCatalog] = useState(readCatalogCache);
  const [tab, setTab] = useState<CatalogTab>('trending');
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState<StationGenre>('all');
  const [trending, setTrending] = useState<RadioStation[]>(cachedCatalog?.stations || []);
  const [search, setSearch] = useState({
    query: '',
    genre: 'all' as StationGenre,
    stations: [] as RadioStation[],
  });
  const [request, setRequest] = useState<CatalogRequest>({
    mode: 'initial',
    genre: 'all',
    query: '',
    loading: true,
    error: null,
  });
  const controllerRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const genreCache = useRef(
    new Map<StationGenre, { time: number; stations: RadioStation[] }>(
      cachedCatalog ? [['all', cachedCatalog]] : []
    )
  );
  const searchCache = useRef(new Map<string, { time: number; stations: RadioStation[] }>());

  const cancelRequest = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = null;
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  const loadStations = useCallback(
    async (mode: RequestMode, searchQuery = '', selectedGenre: StationGenre = 'all') => {
      cancelRequest();
      const controller = new AbortController();
      controllerRef.current = controller;
      setRequest({ mode, genre: selectedGenre, query: searchQuery, loading: true, error: null });

      try {
        const options = { signal: controller.signal, tag: getStationGenre(selectedGenre).tag };
        let stations: RadioStation[];
        switch (mode) {
          case 'initial':
            stations = await fetchInitialStations({ ...options, timeoutMs: 10000 });
            break;
          case 'trending':
            stations = await fetchTrendingStations(options);
            break;
          case 'search':
            stations = await searchStationsByName({ ...options, query: searchQuery });
            break;
        }
        if (controller.signal.aborted) return;
        if (mode === 'search') {
          setSearch({ query: searchQuery, genre: selectedGenre, stations });
          const key = searchKey(searchQuery, selectedGenre);
          searchCache.current.delete(key);
          searchCache.current.set(key, { time: Date.now(), stations });
          if (searchCache.current.size > 8)
            searchCache.current.delete(searchCache.current.keys().next().value!);
        } else {
          setTrending(stations);
          genreCache.current.set(selectedGenre, { time: Date.now(), stations });
          if (mode === 'initial') saveCatalogCache(stations);
        }
        setRequest({ mode, genre: selectedGenre, query: searchQuery, loading: false, error: null });
      } catch (error) {
        if (controller.signal.aborted) return;
        setRequest({
          mode,
          genre: selectedGenre,
          query: searchQuery,
          loading: false,
          error: getReadableErrorMessage(
            error,
            'Could not load radio stations. Check your network and retry.'
          ),
        });
      }
    },
    [cancelRequest]
  );

  useEffect(() => {
    void loadStations('initial');
    return cancelRequest;
  }, [loadStations, cancelRequest]);

  function changeQuery(value: string) {
    cancelRequest();
    setQuery(value);
    setTab('search');
    const cached = searchCache.current.get(searchKey(value.trim(), genre));
    if (cached && Date.now() - cached.time < 300000) {
      setSearch({ query: value.trim(), genre, stations: cached.stations });
      setRequest({ mode: 'search', genre, query: value.trim(), loading: false, error: null });
      return;
    }
    setSearch({ query: '', genre, stations: [] });
    setRequest({
      mode: 'search',
      genre,
      query: value.trim(),
      loading: !!value.trim(),
      error: null,
    });
    if (value.trim()) {
      debounceRef.current = setTimeout(() => {
        void loadStations('search', value.trim(), genre);
      }, 300);
    }
  }

  function showSearch(refresh = false) {
    cancelRequest();
    setTab('search');
    const searchQuery = query.trim();
    if (searchQuery && (refresh || search.query !== searchQuery || search.genre !== genre)) {
      if (search.query !== searchQuery || search.genre !== genre)
        setSearch({ query: '', genre, stations: [] });
      void loadStations('search', searchQuery, genre);
      return;
    }
    if (!searchQuery) setSearch({ query: '', genre, stations: [] });
    setRequest({ mode: 'search', genre, query: searchQuery, loading: false, error: null });
  }

  function changeTab(value: CatalogTab) {
    if (value === 'nearby' || value === 'discover') {
      cancelRequest();
      setTab(value);
      setRequest((current) => ({ ...current, loading: false, error: null }));
      return;
    }
    if (value === 'search') {
      showSearch();
      return;
    }
    setTab('trending');
    setTrending(genreCache.current.get(genre)?.stations || []);
    void loadStations('trending', '', genre);
  }

  function changeGenre(value: StationGenre) {
    if (value === genre) return;
    cancelRequest();
    setGenre(value);
    if (tab === 'nearby' || tab === 'discover') {
      return;
    }
    if (tab === 'search' && query.trim()) {
      setSearch({ query: '', genre: value, stations: [] });
      void loadStations('search', query.trim(), value);
      return;
    }
    setTab('trending');
    const cached = genreCache.current.get(value);
    if (cached && Date.now() - cached.time < 300000) {
      setTrending(cached.stations);
      setRequest({ mode: 'trending', genre: value, query: '', loading: false, error: null });
    } else {
      setTrending([]);
      void loadStations('trending', '', value);
    }
  }

  function retry() {
    const mode = request.mode === 'initial' ? 'initial' : tab === 'search' ? 'search' : 'trending';
    void loadStations(mode, query.trim(), genre);
  }

  const statusText =
    !request.loading || request.mode === 'initial'
      ? null
      : request.mode === 'search'
        ? `Searching: ${request.query}`
        : 'Refreshing trending stations...';

  return {
    tab,
    genre,
    query,
    stations: tab === 'search' ? search.stations : trending,
    loading: request.loading,
    initializing: request.mode === 'initial' && request.loading,
    error: request.error,
    initialError: request.mode === 'initial' ? request.error : null,
    statusText,
    changeQuery,
    changeTab,
    changeGenre,
    submitSearch: () => showSearch(true),
    retry,
    dismissError: () => setRequest((current) => ({ ...current, error: null })),
  };
}

export type StationCatalog = ReturnType<typeof useStationCatalog>;
