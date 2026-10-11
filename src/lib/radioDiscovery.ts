import type { RadioStation } from '../types/radio';
import { getStationIdentity } from './favorites';
import { getSolarPosition } from './solarPosition';
import { hasStationSignal } from './stationEligibility';
import { getStationGenre, type StationGenre } from './stationGenres';

export type DiscoveryMood = 'world' | 'focus' | 'unwind' | 'energy';
export type DiscoverySolarMode = 'any' | 'sunrise' | 'night';
export type StationSolarPhase = 'sunrise' | 'day' | 'sunset' | 'night';

export interface DiscoveryStation {
  station: RadioStation;
  reason: string;
  matchedTags: string[];
  solarPhase: StationSolarPhase;
}

const moodTags: Record<DiscoveryMood, readonly string[]> = {
  world: [],
  focus: ['ambient', 'classical', 'instrumental', 'lo fi', 'lofi', 'piano', 'downtempo'],
  unwind: ['chill', 'chillout', 'ambient', 'lounge', 'jazz', 'acoustic', 'relax', 'soul'],
  energy: [
    'dance',
    'electronic',
    'house',
    'techno',
    'disco',
    'trance',
    'edm',
    'hip hop',
    'rock',
    'funk',
    'pop',
  ],
};

const RAD = Math.PI / 180;

function normalizeTag(tag: string) {
  return tag
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function matchesTag(tag: string, term: string) {
  return ` ${normalizeTag(tag)} `.includes(` ${normalizeTag(term)} `);
}

function getCountryIdentity(station: RadioStation) {
  return (station.countrycode.trim() || station.country.trim()).toLowerCase();
}

function getSolarState(station: RadioStation, sun: ReturnType<typeof getSolarPosition>) {
  const latitude = station.geo_lat! * RAD;
  const declination = sun.lat * RAD;
  const hourAngle = ((station.geo_long! - sun.lng + 540) % 360) - 180;
  const elevation =
    Math.asin(
      Math.max(
        -1,
        Math.min(
          1,
          Math.sin(latitude) * Math.sin(declination) +
            Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle * RAD)
        )
      )
    ) / RAD;
  let phase: StationSolarPhase = elevation < -6 ? 'night' : 'day';
  if (elevation >= -8 && elevation <= 12) phase = hourAngle < 0 ? 'sunrise' : 'sunset';
  return { phase, elevation };
}

function angularDistance(first: RadioStation, second: RadioStation) {
  const firstLatitude = first.geo_lat! * RAD;
  const secondLatitude = second.geo_lat! * RAD;
  return (
    1 -
    (Math.sin(firstLatitude) * Math.sin(secondLatitude) +
      Math.cos(firstLatitude) *
        Math.cos(secondLatitude) *
        Math.cos((first.geo_long! - second.geo_long!) * RAD))
  );
}

function getUniqueSignals(stations: RadioStation[]) {
  const seen = new Set<string>();
  return stations.filter((station) => {
    const id = getStationIdentity(station);
    if (!id || !station.name.trim() || seen.has(id) || !hasStationSignal(station)) return false;
    seen.add(id);
    return true;
  });
}

export function getDiscoveryStations(
  stations: RadioStation[],
  genre: StationGenre,
  mood: DiscoveryMood,
  solarMode: DiscoverySolarMode,
  date: Date
): DiscoveryStation[] {
  const sun = getSolarPosition(date);
  const genreTag = getStationGenre(genre).tag;
  const recommendations: DiscoveryStation[] = [];
  for (const station of getUniqueSignals(stations)) {
    const tags = station.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    if (genreTag && !tags.some((tag) => matchesTag(tag, genreTag))) continue;
    const matchedTags =
      mood === 'world'
        ? tags.slice(0, 2)
        : tags.filter((tag) => moodTags[mood].some((term) => matchesTag(tag, term)));
    if (mood !== 'world' && matchedTags.length === 0) continue;
    const { phase: solarPhase, elevation } = getSolarState(station, sun);
    if (solarMode === 'sunrise' && solarPhase !== 'sunrise') continue;
    if (solarMode === 'night' && elevation >= -6) continue;
    const country = station.country.trim() || station.countrycode.trim() || 'Country not listed';
    const reason = [country];
    if (matchedTags.length) reason.push(`Tagged ${matchedTags.slice(0, 2).join(' / ')}`);
    if (solarMode === 'sunrise') reason.push('Sunrise band');
    if (solarMode === 'night') reason.push('After dark');
    recommendations.push({ station, reason: reason.join(' · '), matchedTags, solarPhase });
  }
  return recommendations.sort(
    (first, second) =>
      (mood === 'world' ? 0 : second.matchedTags.length - first.matchedTags.length) ||
      second.station.clickcount - first.station.clickcount ||
      first.station.name.localeCompare(second.station.name)
  );
}

export function buildSignalJourney(
  stations: RadioStation[],
  startStation?: RadioStation | null
): RadioStation[] {
  const candidates = getUniqueSignals(stations);
  if (candidates.length === 0) return [];
  const startId = getStationIdentity(startStation);
  const start =
    candidates.find((station) => getStationIdentity(station) === startId) || candidates[0];
  const route = [start];
  const visited = new Set([getStationIdentity(start)]);
  const countries = new Set([getCountryIdentity(start)]);
  while (route.length < Math.min(6, candidates.length)) {
    const remaining = candidates.filter((station) => !visited.has(getStationIdentity(station)));
    const newCountries = remaining.filter((station) => {
      const country = getCountryIdentity(station);
      return country && !countries.has(country);
    });
    const pool = newCountries.length ? newCountries : remaining;
    const previous = route[route.length - 1];
    let nearest = pool[0];
    let nearestDistance = angularDistance(previous, nearest);
    for (let index = 1; index < pool.length; index += 1) {
      const distance = angularDistance(previous, pool[index]);
      if (distance < nearestDistance) {
        nearest = pool[index];
        nearestDistance = distance;
      }
    }
    route.push(nearest);
    visited.add(getStationIdentity(nearest));
    countries.add(getCountryIdentity(nearest));
  }
  return route;
}

export function getSurpriseStation(
  stations: RadioStation[],
  seenStationIds: readonly string[],
  currentStation: RadioStation | null,
  random: () => number = Math.random
): { station: RadioStation | null; seenStationIds: string[] } {
  const candidates = getUniqueSignals(stations);
  if (candidates.length === 0) return { station: null, seenStationIds: [] };
  const currentId =
    currentStation?.name.trim() && hasStationSignal(currentStation)
      ? getStationIdentity(currentStation)
      : '';
  const previous = new Set(seenStationIds);
  if (
    candidates.length > 1 &&
    candidates.some((station) => getStationIdentity(station) === currentId)
  ) {
    previous.add(currentId);
  }
  let remaining = candidates.filter((station) => !previous.has(getStationIdentity(station)));
  if (remaining.length === 0) {
    previous.clear();
    remaining = candidates;
  }
  if (remaining.length > 1) {
    remaining = remaining.filter((station) => getStationIdentity(station) !== currentId);
  }
  const sample = random();
  const index = Math.floor(
    (Number.isFinite(sample) ? Math.max(0, Math.min(sample, 0.999999)) : 0) * remaining.length
  );
  const station = remaining[index];
  previous.add(getStationIdentity(station));
  return { station, seenStationIds: [...previous] };
}
