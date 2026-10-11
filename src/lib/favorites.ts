import type { RadioStation } from '../types/radio';

export const FAVORITES_STORAGE_KEY = 'radioExplorerFavorites';
export const LEGACY_FAVORITES_STORAGE_KEY = 'likedChannels';

const normalizeString = (value: unknown) => (typeof value === 'string' ? value : '');
const normalizeNullableNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const normalizeNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

export const getStationIdentity = (station: Partial<RadioStation> | null | undefined) => {
  if (!station) {
    return '';
  }

  const stationId = normalizeString(station.stationuuid).trim();
  if (stationId) {
    return `id:${stationId}`;
  }

  const streamUrl = normalizeString(station.url_resolved || station.url).trim();
  if (streamUrl) {
    return `stream:${streamUrl}`;
  }

  const fallbackName = normalizeString(station.name).trim().toLowerCase();
  const fallbackCountry = normalizeString(station.country).trim().toLowerCase();
  if (fallbackName) {
    return `name:${fallbackName}|country:${fallbackCountry}`;
  }

  return '';
};

export const normalizeFavoriteStation = (value: unknown): RadioStation | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const source = value as Partial<RadioStation>;
  const normalized: RadioStation = {
    changeid: normalizeString(source.changeid),
    stationuuid: normalizeString(source.stationuuid),
    name: normalizeString(source.name),
    url: normalizeString(source.url),
    url_resolved: normalizeString(source.url_resolved),
    homepage: normalizeString(source.homepage),
    favicon: normalizeString(source.favicon),
    tags: normalizeString(source.tags),
    country: normalizeString(source.country),
    countrycode: normalizeString(source.countrycode),
    iso_3166_2: typeof source.iso_3166_2 === 'string' ? source.iso_3166_2 : null,
    state: normalizeString(source.state),
    language: normalizeString(source.language),
    languagecodes: normalizeString(source.languagecodes),
    votes: normalizeNumber(source.votes),
    lastchangetime: normalizeString(source.lastchangetime),
    codec: normalizeString(source.codec),
    bitrate: normalizeNumber(source.bitrate),
    hls: normalizeNumber(source.hls),
    lastcheckok: normalizeNumber(source.lastcheckok),
    lastchecktime: normalizeString(source.lastchecktime),
    lastcheckoktime: normalizeString(source.lastcheckoktime),
    lastlocalchecktime: normalizeString(source.lastlocalchecktime),
    clickcount: normalizeNumber(source.clickcount),
    clickcount_day: normalizeNumber(source.clickcount_day),
    clickcount_week: normalizeNumber(source.clickcount_week),
    clickcount_month: normalizeNumber(source.clickcount_month),
    clicktimestamp: normalizeString(source.clicktimestamp),
    clicktimestamp_day: normalizeString(source.clicktimestamp_day),
    clicktimestamp_week: normalizeString(source.clicktimestamp_week),
    clicktimestamp_month: normalizeString(source.clicktimestamp_month),
    geo_lat: normalizeNullableNumber(source.geo_lat),
    geo_long: normalizeNullableNumber(source.geo_long),
    has_extended_info: Boolean(source.has_extended_info),
  };

  return getStationIdentity(normalized) ? normalized : null;
};

export const dedupeFavoriteStations = (stations: RadioStation[]) => {
  const seen = new Set<string>();

  return stations.filter((station) => {
    const identity = getStationIdentity(station);
    if (!identity || seen.has(identity)) {
      return false;
    }

    seen.add(identity);
    return true;
  });
};

export const readFavoritesFromStorage = () => {
  if (typeof window === 'undefined') {
    return [];
  }

  const parsedCollections = [FAVORITES_STORAGE_KEY, LEGACY_FAVORITES_STORAGE_KEY].flatMap((key) => {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error(`Failed to parse favorites from localStorage key "${key}":`, error);
      return [];
    }
  });

  return dedupeFavoriteStations(
    parsedCollections
      .map((item) => normalizeFavoriteStation(item))
      .filter((item): item is RadioStation => Boolean(item))
  );
};

export const writeFavoritesToStorage = (favorites: RadioStation[]) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const normalizedFavorites = dedupeFavoriteStations(
      favorites
        .map((station) => normalizeFavoriteStation(station))
        .filter((item): item is RadioStation => Boolean(item))
    );

    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(normalizedFavorites));
    window.localStorage.removeItem(LEGACY_FAVORITES_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to save favorites to localStorage:', error);
  }
};
