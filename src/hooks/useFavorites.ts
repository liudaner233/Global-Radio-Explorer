import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getStationIdentity,
  readFavoritesFromStorage,
  writeFavoritesToStorage,
} from '../lib/favorites';
import type { RadioStation } from '../types/radio';

export function useFavorites(stations: RadioStation[]) {
  const [savedStations, setSavedStations] = useState(readFavoritesFromStorage);

  useEffect(() => {
    writeFavoritesToStorage(savedStations);
  }, [savedStations]);

  const identities = useMemo(() => new Set(savedStations.map(getStationIdentity)), [savedStations]);
  const isFavorite = useCallback(
    (station: RadioStation) => identities.has(getStationIdentity(station)),
    [identities]
  );

  const toggleFavorite = useCallback((station: RadioStation) => {
    const identity = getStationIdentity(station);
    if (!identity) return;
    setSavedStations((current) =>
      current.some((item) => getStationIdentity(item) === identity)
        ? current.filter((item) => getStationIdentity(item) !== identity)
        : [station, ...current]
    );
  }, []);

  const favorites = useMemo(() => {
    const updatedStations = new Map(
      stations.map((station) => [getStationIdentity(station), station])
    );
    return savedStations.map(
      (station) => updatedStations.get(getStationIdentity(station)) ?? station
    );
  }, [savedStations, stations]);

  return { favorites, isFavorite, toggleFavorite };
}
