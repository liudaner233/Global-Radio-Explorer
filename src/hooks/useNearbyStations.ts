import { useEffect, type RefObject } from 'react';
import type { GlobeMethods } from 'react-globe.gl';
import { createNearbyFinder, type NearbyStation } from '../lib/nearbyStations';
import { getStationIdentity } from '../lib/favorites';
import type { StationGenre } from '../lib/stationGenres';
import type { RadioStation } from '../types/radio';

export function useNearbyStations(
  globeRef: RefObject<GlobeMethods | undefined>,
  active: boolean,
  stations: RadioStation[],
  genre: StationGenre,
  onChange?: (stations: NearbyStation[]) => void
) {
  useEffect(() => {
    const globe = globeRef.current;
    if (!active || !globe || !onChange) return;
    const find = createNearbyFinder(stations, genre);
    const controls = globe.controls();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let previous: string | undefined;
    function update() {
      timer = undefined;
      if (document.hidden) return;
      const { lat, lng } = globe!.pointOfView();
      const nearby = find(lat, lng);
      const signature = nearby
        .map(({ station, distance }) => `${getStationIdentity(station)}:${Math.round(distance)}`)
        .join('|');
      if (signature === previous) return;
      previous = signature;
      onChange!(nearby);
    }
    function queue() {
      if (!timer && !document.hidden) timer = setTimeout(update, 500);
    }
    controls.addEventListener('change', queue);
    document.addEventListener('visibilitychange', queue);
    update();
    return () => {
      clearTimeout(timer);
      controls.removeEventListener('change', queue);
      document.removeEventListener('visibilitychange', queue);
    };
  }, [globeRef, active, stations, genre, onChange]);
}
