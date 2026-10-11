import type { RadioStation } from '../types/radio';
import { getStationIdentity, normalizeFavoriteStation } from './favorites';

export const LISTENING_PASSPORT_STORAGE_KEY = 'radioExplorerListeningPassport';
export const PASSPORT_RECENT_LIMIT = 20;

export interface PassportCountry {
  id: string;
  name: string;
  code: string;
  seconds: number;
  firstListenedAt: number;
  lastListenedAt: number;
}

export interface PassportStation {
  id: string;
  station: RadioStation;
  seconds: number;
  lastListenedAt: number;
}

export interface ListeningPassportData {
  version: 1;
  totalSeconds: number;
  countries: PassportCountry[];
  recent: PassportStation[];
}

export const createListeningPassport = (): ListeningPassportData => ({
  version: 1,
  totalSeconds: 0,
  countries: [],
  recent: [],
});

const validNumber = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= Number.MAX_SAFE_INTEGER;

const validTime = (value: unknown): value is number =>
  validNumber(value) && value > 0 && value <= 8_640_000_000_000_000;

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const countryIdentity = (name: string, code: string) =>
  code ? `country:${code}` : name ? `name:${name.toLowerCase()}` : '';

const countryCode = (value: unknown) => {
  const code = text(value).toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : '';
};

const normalizeListeningStation = (value: unknown) => {
  const station = normalizeFavoriteStation(value);
  if (!station || !station.name.trim()) return null;
  try {
    const url = new URL(station.url_resolved || station.url);
    return url.protocol === 'https:' || url.protocol === 'http:' ? station : null;
  } catch {
    return null;
  }
};

export function recordPassportListening(
  passport: ListeningPassportData,
  input: RadioStation,
  seconds: number,
  at = Date.now()
): ListeningPassportData {
  if (!validNumber(seconds) || seconds === 0 || !validTime(at)) return passport;
  const station = normalizeListeningStation(input);
  if (!station || !validNumber(passport.totalSeconds + seconds)) return passport;
  const id = getStationIdentity(station);
  const previous = passport.recent.find((entry) => entry.id === id);
  const entry = {
    id,
    station,
    seconds: (previous?.seconds ?? 0) + seconds,
    lastListenedAt: Math.max(previous?.lastListenedAt ?? 0, at),
  };
  const name = station.country.trim();
  const code = countryCode(station.countrycode);
  const countryId = countryIdentity(name, code);
  let countries = passport.countries;
  if (countryId) {
    const country = countries.find(
      (item) =>
        item.id === countryId ||
        ((!item.code || !code) && name && item.name.toLowerCase() === name.toLowerCase())
    );
    const resolvedCode = code || country?.code || '';
    const resolvedName = name || country?.name || resolvedCode;
    const updated: PassportCountry = {
      id: countryIdentity(resolvedName, resolvedCode),
      name: resolvedName,
      code: resolvedCode,
      seconds: (country?.seconds ?? 0) + seconds,
      firstListenedAt: Math.min(country?.firstListenedAt ?? at, at),
      lastListenedAt: Math.max(country?.lastListenedAt ?? at, at),
    };
    countries = [
      updated,
      ...countries.filter((item) => item.id !== (country?.id ?? countryId)),
    ].sort((left, right) => right.lastListenedAt - left.lastListenedAt);
  }
  return {
    version: 1,
    totalSeconds: passport.totalSeconds + seconds,
    countries,
    recent: [entry, ...passport.recent.filter((item) => item.id !== id)]
      .sort((left, right) => right.lastListenedAt - left.lastListenedAt)
      .slice(0, PASSPORT_RECENT_LIMIT),
  };
}

export function normalizeListeningPassport(value: unknown): ListeningPassportData {
  const empty = createListeningPassport();
  if (!value || typeof value !== 'object') return empty;
  const source = value as Partial<ListeningPassportData>;
  if (source.version !== 1 || !validNumber(source.totalSeconds)) return empty;
  const countries = new Map<string, PassportCountry>();
  if (Array.isArray(source.countries)) {
    for (const item of source.countries) {
      if (!item || typeof item !== 'object') continue;
      const name = text(item.name);
      const code = countryCode(item.code);
      const id = countryIdentity(name, code);
      if (
        !id ||
        !validNumber(item.seconds) ||
        item.seconds === 0 ||
        item.seconds > source.totalSeconds ||
        !validTime(item.firstListenedAt) ||
        !validTime(item.lastListenedAt) ||
        item.lastListenedAt < item.firstListenedAt
      ) {
        continue;
      }
      const previous = countries.get(id);
      if (!previous || previous.lastListenedAt < item.lastListenedAt) {
        countries.set(id, {
          id,
          name: name || code,
          code,
          seconds: item.seconds,
          firstListenedAt: item.firstListenedAt,
          lastListenedAt: item.lastListenedAt,
        });
      }
    }
  }
  const recent = new Map<string, PassportStation>();
  if (Array.isArray(source.recent)) {
    for (const item of source.recent) {
      if (!item || typeof item !== 'object') continue;
      const station = normalizeListeningStation(item.station);
      if (
        !station ||
        !validNumber(item.seconds) ||
        item.seconds === 0 ||
        item.seconds > source.totalSeconds ||
        !validTime(item.lastListenedAt)
      ) {
        continue;
      }
      const id = getStationIdentity(station);
      const previous = recent.get(id);
      if (!previous || previous.lastListenedAt < item.lastListenedAt) {
        recent.set(id, { id, station, seconds: item.seconds, lastListenedAt: item.lastListenedAt });
      }
    }
  }
  return {
    version: 1,
    totalSeconds: source.totalSeconds,
    countries: [...countries.values()].sort(
      (left, right) => right.lastListenedAt - left.lastListenedAt
    ),
    recent: [...recent.values()]
      .sort((left, right) => right.lastListenedAt - left.lastListenedAt)
      .slice(0, PASSPORT_RECENT_LIMIT),
  };
}

export function readListeningPassport(): ListeningPassportData {
  if (typeof window === 'undefined') return createListeningPassport();
  try {
    const stored = window.localStorage.getItem(LISTENING_PASSPORT_STORAGE_KEY);
    return stored ? normalizeListeningPassport(JSON.parse(stored)) : createListeningPassport();
  } catch {
    return createListeningPassport();
  }
}

export function writeListeningPassport(passport: ListeningPassportData) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LISTENING_PASSPORT_STORAGE_KEY, JSON.stringify(passport));
  } catch {
    return;
  }
}

export function removeListeningPassport() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LISTENING_PASSPORT_STORAGE_KEY);
  } catch {
    return;
  }
}

export function formatListeningDuration(seconds: number) {
  const rounded = Math.floor(validNumber(seconds) ? seconds : 0);
  if (rounded < 60) return `${rounded}s`;
  const minutes = Math.floor(rounded / 60);
  if (minutes < 60) return `${minutes}m ${rounded % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
