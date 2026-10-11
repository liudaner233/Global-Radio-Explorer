import { useEffect, useState, type RefObject } from 'react';
import type { GlobeMethods } from 'react-globe.gl';
import { createTimeFormatter, getDaylightPhase, getLocationTimezone } from '../lib/locationTime';

export function useGlobeClock(globeRef: RefObject<GlobeMethods | undefined>) {
  const [clock, setClock] = useState({ time: '', timezone: 'UTC', phase: 'Daytime', iso: '' });
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    let timezone = '';
    let formatter = createTimeFormatter('UTC');
    let timer: ReturnType<typeof setTimeout> | undefined;
    function update() {
      if (document.hidden) return;
      const view = globe!.pointOfView();
      const next = getLocationTimezone(view.lat, view.lng);
      if (next !== timezone) {
        timezone = next;
        formatter = createTimeFormatter(timezone);
      }
      const date = new Date();
      const time = formatter.format(date);
      const phase = getDaylightPhase(date, view.lat, view.lng);
      setClock((previous) =>
        previous.time === time && previous.timezone === timezone && previous.phase === phase
          ? previous
          : { time, timezone, phase, iso: date.toISOString() }
      );
    }
    function queue() {
      clearTimeout(timer);
      timer = setTimeout(update, 120);
    }
    const interval = setInterval(update, 1000);
    globe.controls().addEventListener('change', queue);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      clearInterval(interval);
      clearTimeout(timer);
      globe.controls().removeEventListener('change', queue);
      document.removeEventListener('visibilitychange', update);
    };
  }, [globeRef]);
  return clock;
}
