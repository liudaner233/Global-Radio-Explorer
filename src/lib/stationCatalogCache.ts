import { dedupeFavoriteStations, normalizeFavoriteStation } from './favorites';
import type { RadioStation } from '../types/radio';

const STORAGE_KEY = 'radioExplorerCatalog';
const MAX_AGE = 30 * 60 * 1000;

export function readCatalogCache(): { time: number; stations: RadioStation[] } | null {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (
      !saved ||
      typeof saved.time !== 'number' ||
      !Number.isFinite(saved.time) ||
      saved.time > Date.now() ||
      Date.now() - saved.time > MAX_AGE ||
      !Array.isArray(saved.stations)
    )
      return null;
    const stations = dedupeFavoriteStations(
      saved.stations
        .slice(0, 200)
        .map(normalizeFavoriteStation)
        .filter((station: RadioStation | null): station is RadioStation => !!station?.name)
    );
    return stations.length ? { time: saved.time, stations } : null;
  } catch {
    return null;
  }
}

export function saveCatalogCache(stations: RadioStation[]) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ time: Date.now(), stations: stations.slice(0, 200) })
    );
  } catch {
    return;
  }
}
