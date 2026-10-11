import { getStationGenre, type StationGenre } from './stationGenres';
import { hasStationSignal } from './stationEligibility';
import type { RadioStation } from '../types/radio';

export interface NearbyStation {
  station: RadioStation;
  distance: number;
}

const radians = Math.PI / 180;
const normalizeTag = (tag: string) => tag.trim().toLowerCase().replace(/[-_]+/g, ' ');

export function createNearbyFinder(stations: RadioStation[], genre: StationGenre = 'all') {
  const tag = normalizeTag(getStationGenre(genre).tag);
  const candidates = stations
    .filter(
      (station) =>
        hasStationSignal(station) &&
        (!tag || station.tags.split(',').some((value) => normalizeTag(value) === tag))
    )
    .map((station) => {
      const latitude = station.geo_lat! * radians;
      const longitude = station.geo_long! * radians;
      return {
        station,
        x: Math.cos(latitude) * Math.cos(longitude),
        y: Math.cos(latitude) * Math.sin(longitude),
        z: Math.sin(latitude),
      };
    });
  const scores = new Float64Array(candidates.length);
  const order = candidates.map((_, index) => index);

  return (latitude: number, longitude: number, limit = 24): NearbyStation[] => {
    const lat = latitude * radians;
    const lng = longitude * radians;
    const x = Math.cos(lat) * Math.cos(lng);
    const y = Math.cos(lat) * Math.sin(lng);
    const z = Math.sin(lat);
    for (let index = 0; index < candidates.length; index++) {
      const candidate = candidates[index];
      scores[index] = candidate.x * x + candidate.y * y + candidate.z * z;
    }
    order.sort((a, b) => scores[b] - scores[a] || a - b);
    return order.slice(0, limit).map((index) => ({
      station: candidates[index].station,
      distance: 6371 * Math.acos(Math.max(-1, Math.min(1, scores[index]))),
    }));
  };
}
