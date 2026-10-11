import type { RadioStation } from '../types/radio';
import { normalizeFavoriteStation } from './favorites';

const RADIO_BROWSER_BASE_URLS = [
  'https://de1.api.radio-browser.info/json/stations/search',
  'https://fr1.api.radio-browser.info/json/stations/search',
  'https://nl1.api.radio-browser.info/json/stations/search',
];
const DEFAULT_TIMEOUT_MS = 9000;

type FetchStationsOptions = {
  tag?: string;
  limit?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
};

type SearchStationsOptions = FetchStationsOptions & {
  query: string;
};

const createTimeoutError = () => {
  const error = new Error('Request timed out');
  error.name = 'TimeoutError';
  return error;
};

const buildSearchUrl = (baseUrl: string, params: Record<string, string | number>) => {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });
  return url.toString();
};

const parseStationsPayload = (payload: unknown): RadioStation[] => {
  if (!Array.isArray(payload)) {
    throw new Error('Invalid station response payload');
  }
  const stations = payload
    .map(normalizeFavoriteStation)
    .filter((station): station is RadioStation => !!station?.name);
  if (payload.length && !stations.length) throw new Error('Invalid station response payload');
  return stations;
};

export const getReadableErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || error.message.toLowerCase().includes('timed out')) {
      return 'The request timed out. Please try again in a few seconds.';
    }
    if (error.name === 'AbortError') {
      return 'The request was cancelled.';
    }
    return error.message || fallback;
  }
  return fallback;
};

export const fetchJsonWithTimeout = async <T>(
  url: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {}
) => {
  const { signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(createTimeoutError()), timeoutMs);

  const abortForwarder = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeout);
      throw signal.reason instanceof Error
        ? signal.reason
        : new DOMException('Aborted', 'AbortError');
    }
    signal.addEventListener('abort', abortForwarder, { once: true });
  }

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (controller.signal.aborted && error instanceof DOMException && error.name === 'AbortError') {
      const reason = controller.signal.reason;
      if (reason instanceof Error) {
        throw reason;
      }
      throw error;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    if (signal) {
      signal.removeEventListener('abort', abortForwarder);
    }
  }
};

const fetchStations = async (
  params: Record<string, string | number>,
  options: FetchStationsOptions = {}
) => {
  const { limit = 100, tag, ...requestOptions } = options;
  const filters = {
    limit,
    hidebroken: 'true',
    order: 'clickcount',
    reverse: 'true',
    is_https: 'true',
    ...(tag ? { tag } : {}),
    ...params,
  };
  let lastError: unknown;

  for (const baseUrl of RADIO_BROWSER_BASE_URLS) {
    try {
      const payload = await fetchJsonWithTimeout<unknown>(
        buildSearchUrl(baseUrl, filters),
        requestOptions
      );
      return parseStationsPayload(payload);
    } catch (error) {
      if (options.signal?.aborted) {
        throw error;
      }
      lastError = error;
    }
  }

  throw lastError ?? new Error('Unable to load radio stations.');
};

export const fetchInitialStations = async (options: FetchStationsOptions = {}) => {
  return fetchStations({}, { ...options, limit: options.limit ?? 200 });
};

export const fetchTrendingStations = async (options: FetchStationsOptions = {}) => {
  return fetchStations({}, options);
};

export function fetchMapStations(options: FetchStationsOptions & { offset?: number } = {}) {
  const { offset = 0, ...requestOptions } = options;
  return fetchStations({ has_geo_info: 'true', offset }, requestOptions);
}

export const searchStationsByName = async (options: SearchStationsOptions) => {
  const { query, ...requestOptions } = options;
  return fetchStations({ name: query }, requestOptions);
};

export function fetchCountryStations(
  options: FetchStationsOptions & { countryCode?: string; countryName?: string; offset?: number }
) {
  const { countryCode = '', countryName = '', offset = 0, ...requestOptions } = options;
  const code = countryCode.trim().toUpperCase();
  const name = countryName.trim();
  if (/^[A-Z]{2}$/.test(code)) return fetchStations({ countrycode: code, offset }, requestOptions);
  if (name) return fetchStations({ country: name, countryExact: 'true', offset }, requestOptions);
  return Promise.reject(new Error('This region has no country information available.'));
}
