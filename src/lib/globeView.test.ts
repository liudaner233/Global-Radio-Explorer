import {
  DETAIL_ALTITUDE,
  MIN_ALTITUDE,
  MAX_ALTITUDE,
  getCenterTile,
  getSurfaceAltitude,
  getZoomAltitude,
} from './globeView';

describe('globe map view', () => {
  it('allows city-scale zoom and clamps both zoom directions', () => {
    expect(getZoomAltitude(1.45, 'in')).toBeLessThan(1.45);
    expect(getZoomAltitude(MIN_ALTITUDE, 'in')).toBe(MIN_ALTITUDE);
    expect(getZoomAltitude(MAX_ALTITUDE, 'out')).toBe(MAX_ALTITUDE);
    expect(MIN_ALTITUDE).toBeLessThan(0.001);
  });

  it('requests higher detail for closer views', () => {
    expect(getCenterTile(48.85, 2.35, 0.001).level).toBeGreaterThan(
      getCenterTile(48.85, 2.35, DETAIL_ALTITUDE).level
    );
  });

  it('wraps the antimeridian and clamps Mercator poles', () => {
    expect(getCenterTile(0, 180, 0.2).x).toBe(getCenterTile(0, -180, 0.2).x);
    expect(getCenterTile(90, 0, 0.2).y).toBe(0);
    const south = getCenterTile(-90, 0, 0.2);
    expect(south.y).toBe(2 ** south.level - 1);
  });

  it('keeps signals between the surface and a close camera', () => {
    const elevation = getSurfaceAltitude(MIN_ALTITUDE);
    expect(elevation).toBeGreaterThan(0);
    expect(elevation).toBeLessThan(MIN_ALTITUDE);
    expect(getSurfaceAltitude(1.45)).toBe(0.008);
  });
});
