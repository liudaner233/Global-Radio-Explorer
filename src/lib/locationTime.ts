import tzlookup from 'tz-lookup';
import { getSolarPosition } from './solarPosition';

export function getLocationTimezone(lat: number, lng: number) {
  try {
    return tzlookup(lat, ((((lng + 180) % 360) + 360) % 360) - 180);
  } catch {
    return 'UTC';
  }
}

export function getDaylightPhase(date: Date, lat: number, lng: number) {
  const sun = getSolarPosition(date);
  const radians = Math.PI / 180;
  const cosine =
    Math.sin(lat * radians) * Math.sin(sun.lat * radians) +
    Math.cos(lat * radians) * Math.cos(sun.lat * radians) * Math.cos((lng - sun.lng) * radians);
  const elevation = Math.asin(Math.max(-1, Math.min(1, cosine))) / radians;
  if (elevation > 6) return 'Daytime';
  if (elevation < -6) return 'Nighttime';
  const hourAngle = ((lng - sun.lng + 540) % 360) - 180;
  return hourAngle < 0 ? 'Sunrise' : 'Sunset';
}

export function createTimeFormatter(timeZone: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
}
