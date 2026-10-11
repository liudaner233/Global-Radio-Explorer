import { getSolarPosition } from './solarPosition';

describe('solar position', () => {
  it('places solar noon near Greenwich and midnight on the opposite side', () => {
    const noon = getSolarPosition(new Date('2026-03-20T12:00:00Z'));
    const midnight = getSolarPosition(new Date('2026-03-20T00:00:00Z'));
    expect(Math.abs(noon.lat)).toBeLessThan(1);
    expect(Math.abs(noon.lng)).toBeLessThan(3);
    expect(Math.abs(midnight.lng)).toBeGreaterThan(177);
  });

  it('moves the sunlight west as UTC time advances', () => {
    const first = getSolarPosition(new Date('2026-10-02T06:00:00Z'));
    const later = getSolarPosition(new Date('2026-10-02T09:00:00Z'));
    expect(first.lng - later.lng).toBeCloseTo(45, 0);
  });

  it('accounts for the seasonal tilt in both hemispheres', () => {
    const summer = getSolarPosition(new Date('2026-06-21T12:00:00Z'));
    const winter = getSolarPosition(new Date('2026-12-21T12:00:00Z'));
    expect(summer.lat).toBeGreaterThan(23);
    expect(summer.lat).toBeLessThan(24);
    expect(winter.lat).toBeLessThan(-23);
    expect(winter.lat).toBeGreaterThan(-24);
  });

  it('uses the same instant regardless of timezone notation and handles leap years', () => {
    expect(getSolarPosition(new Date('2024-02-29T20:00:00+08:00'))).toEqual(
      getSolarPosition(new Date('2024-02-29T12:00:00Z'))
    );
    const { lat, lng } = getSolarPosition(new Date('2024-12-31T23:59:59Z'));
    expect(Number.isFinite(lat)).toBe(true);
    expect(lng).toBeGreaterThanOrEqual(-180);
    expect(lng).toBeLessThan(180);
  });
});
