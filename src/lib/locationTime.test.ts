import { createTimeFormatter, getDaylightPhase, getLocationTimezone } from './locationTime';

describe('location time', () => {
  it('uses geographic timezones rather than rounding longitude', () => {
    const india = getLocationTimezone(28.61, 77.21);
    expect(createTimeFormatter(india).format(new Date('2026-10-02T06:00:00Z'))).toBe('11:30:00');
    const nepal = getLocationTimezone(27.72, 85.32);
    expect(createTimeFormatter(nepal).format(new Date('2026-10-02T06:00:00Z'))).toBe('11:45:00');
  });
  it('honors daylight saving and falls back safely for invalid coordinates', () => {
    const zone = getLocationTimezone(40.71, -74.01);
    expect(createTimeFormatter(zone).format(new Date('2026-07-01T12:00:00Z'))).toBe('08:00:00');
    expect(createTimeFormatter(zone).format(new Date('2026-01-01T12:00:00Z'))).toBe('07:00:00');
    expect(getLocationTimezone(NaN, Infinity)).toBe('UTC');
  });
  it('distinguishes daylight, darkness and morning/evening twilight', () => {
    expect(getDaylightPhase(new Date('2026-03-20T12:00:00Z'), 0, 0)).toBe('Daytime');
    expect(getDaylightPhase(new Date('2026-03-20T00:00:00Z'), 0, 0)).toBe('Nighttime');
    expect(getDaylightPhase(new Date('2026-03-20T06:00:00Z'), 0, 0)).toBe('Sunrise');
    expect(getDaylightPhase(new Date('2026-03-20T18:00:00Z'), 0, 0)).toBe('Sunset');
    expect(getDaylightPhase(new Date('2026-12-21T12:00:00Z'), 89, 0)).toBe('Nighttime');
  });
});
