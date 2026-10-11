import { useCallback, useState } from 'react';
import { dedupeFavoriteStations, getStationIdentity } from '../lib/favorites';
import { hasStationSignal } from '../lib/stationEligibility';
import type { RadioStation } from '../types/radio';

export function useSignalJourney(onSelectStation: (station: RadioStation) => void) {
  const [journey, setJourney] = useState<{ route: RadioStation[]; index: number }>({
    route: [],
    index: 0,
  });

  const start = useCallback(
    (stations: RadioStation[]) => {
      const route = dedupeFavoriteStations(stations.filter(hasStationSignal)).slice(0, 6);
      if (!route.length) return;
      setJourney({ route, index: 0 });
      onSelectStation(route[0]);
    },
    [onSelectStation]
  );

  const goTo = useCallback(
    (index: number) => {
      if (!Number.isInteger(index) || index < 0 || index >= journey.route.length) return;
      setJourney((current) => ({ ...current, index }));
      onSelectStation(journey.route[index]);
    },
    [journey.route, onSelectStation]
  );

  const followStation = useCallback((station: RadioStation) => {
    const identity = getStationIdentity(station);
    setJourney((current) => {
      if (!current.route.length) return current;
      const index = current.route.findIndex((stop) => getStationIdentity(stop) === identity);
      return index < 0 ? { route: [], index: 0 } : { ...current, index };
    });
  }, []);

  const end = useCallback(() => setJourney({ route: [], index: 0 }), []);
  return {
    ...journey,
    start,
    goTo,
    followStation,
    end,
    previous: journey.index > 0 ? () => goTo(journey.index - 1) : undefined,
    next: journey.index < journey.route.length - 1 ? () => goTo(journey.index + 1) : undefined,
  };
}
