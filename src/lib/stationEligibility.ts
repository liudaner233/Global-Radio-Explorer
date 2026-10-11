import type { RadioStation } from '../types/radio';

export function hasStationSignal(station: RadioStation) {
  if (
    station.lastcheckok !== 1 ||
    !Number.isFinite(station.geo_lat) ||
    !Number.isFinite(station.geo_long)
  )
    return false;
  if (Math.abs(station.geo_lat!) > 90 || Math.abs(station.geo_long!) > 180) return false;
  try {
    const url = new URL(station.url_resolved || station.url);
    return (
      url.protocol === 'https:' || (url.protocol === 'http:' && location.protocol !== 'https:')
    );
  } catch {
    return false;
  }
}
