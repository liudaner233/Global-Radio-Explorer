import { useCallback, useEffect, useRef, useState } from 'react';
import { getCountryCode, getCountryName, type CountryFeature } from '../lib/countries';
import { getStationIdentity } from '../lib/favorites';
import { fetchCountryStations, getReadableErrorMessage } from '../lib/radioApi';
import type { RadioStation } from '../types/radio';

const PAGE_SIZE = 50;
const CACHE_DURATION = 5 * 60 * 1000;

interface CountryResults {
  key: string;
  stations: RadioStation[];
  offset: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
}

const emptyResults: CountryResults = {
  key: '',
  stations: [],
  offset: 0,
  hasMore: false,
  loading: false,
  loadingMore: false,
  error: null,
};

export function useCountryStations(country: CountryFeature | null) {
  const code = getCountryCode(country);
  const name = getCountryName(country);
  const key = country ? code || name || 'unknown' : '';
  const cache = useRef(new Map<string, { results: CountryResults; expires: number }>());
  const controllerRef = useRef<AbortController | null>(null);
  const [results, setResults] = useState(emptyResults);

  const loadPage = useCallback(
    async (append = false) => {
      if (!key) return;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const previous = append ? cache.current.get(key)?.results : undefined;
      const page = previous ?? { ...emptyResults, key };
      setResults({ ...page, loading: !append, loadingMore: append, error: null });
      try {
        const stations = await fetchCountryStations({
          countryCode: code,
          countryName: name,
          limit: PAGE_SIZE,
          offset: page.offset,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const uniqueStations = new Map(
          [...page.stations, ...stations].map((station) => [getStationIdentity(station), station])
        );
        const next = {
          ...emptyResults,
          key,
          stations: [...uniqueStations.values()],
          offset: page.offset + stations.length,
          hasMore: stations.length === PAGE_SIZE,
        };
        cache.current.set(key, { results: next, expires: Date.now() + CACHE_DURATION });
        setResults(next);
      } catch (error) {
        if (controller.signal.aborted) return;
        setResults({
          ...page,
          loading: false,
          loadingMore: false,
          error: getReadableErrorMessage(
            error,
            'Could not load stations for this country. Please retry.'
          ),
        });
      }
    },
    [code, name, key]
  );

  useEffect(() => {
    if (!key) return;
    const cached = cache.current.get(key);
    let timer: ReturnType<typeof setTimeout>;
    if (cached && cached.expires > Date.now()) {
      setResults(cached.results);
    } else {
      setResults({ ...emptyResults, key, loading: true });
      timer = setTimeout(() => {
        void loadPage();
      }, 250);
    }
    return () => {
      clearTimeout(timer);
      controllerRef.current?.abort();
    };
  }, [key, loadPage]);

  const current = results.key === key ? results : { ...emptyResults, key, loading: Boolean(key) };
  return {
    ...current,
    loadMore: () => loadPage(true),
    retry: () => loadPage(current.stations.length > 0),
  };
}
