import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { GlobeMethods } from 'react-globe.gl';
import { createStationSignals } from '../lib/stationSignals';
import type { RadioStation } from '../types/radio';
import type { StationGenre } from '../lib/stationGenres';

export function useStationSignals(
  globeRef: RefObject<GlobeMethods | undefined>,
  ready: boolean,
  stations: RadioStation[],
  onSelect: (station: RadioStation, event: PointerEvent) => void,
  genre: StationGenre = 'all'
) {
  const signals = useRef<ReturnType<typeof createStationSignals> | null>(null);
  const selectRef = useRef(onSelect);
  const stationsRef = useRef(stations);
  const genreRef = useRef(genre);
  useEffect(() => {
    selectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    genreRef.current = genre;
    signals.current?.updateGenre(genre);
    if (stationsRef.current !== stations) {
      stationsRef.current = stations;
      signals.current?.updateStations(stations);
    }
  }, [stations, genre]);

  useEffect(() => {
    if (!ready || !globeRef.current) return;
    const globe = globeRef.current;
    const timer = setTimeout(() => {
      signals.current = createStationSignals(
        globe,
        stationsRef.current,
        (station, event) => selectRef.current(station, event),
        genreRef.current
      );
    }, 300);
    return () => {
      clearTimeout(timer);
      signals.current?.dispose();
      signals.current = null;
    };
  }, [globeRef, ready]);

  return useCallback(() => signals.current?.startScan(), []);
}
