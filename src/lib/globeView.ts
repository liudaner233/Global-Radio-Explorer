export const INITIAL_VIEW = { lat: 20, lng: 0, altitude: 1.45 };
export const MIN_ALTITUDE = 0.0008;
export const MAX_ALTITUDE = 3;
export const DETAIL_ALTITUDE = 0.65;

export function getSurfaceAltitude(altitude: number) {
  return Math.max(0.00001, Math.min(0.008, altitude * 0.02));
}

export function getZoomAltitude(altitude: number, direction: 'in' | 'out') {
  return Math.max(MIN_ALTITUDE, Math.min(MAX_ALTITUDE, altitude * (direction === 'in' ? 0.5 : 2)));
}

const tileTemplate =
  import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export function getMapTileUrl(x: number, y: number, level: number) {
  return tileTemplate
    .replace('{z}', String(level))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
}

export function getCenterTile(lat: number, lng: number, altitude: number) {
  const level = Math.min(14, Math.max(0, Math.ceil(Math.log2(8 / altitude))));
  const scale = 2 ** level;
  const latitude = (Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI) / 180;
  return {
    level,
    x: Math.floor((((((lng + 180) % 360) + 360) % 360) / 360) * scale),
    y: Math.max(
      0,
      Math.min(scale - 1, Math.floor(((1 - Math.asinh(Math.tan(latitude)) / Math.PI) / 2) * scale))
    ),
  };
}
