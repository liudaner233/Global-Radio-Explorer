import { useEffect, useMemo, useState } from 'react';
import { dedupeFavoriteStations } from '../lib/favorites';
import { fetchMapStations } from '../lib/radioApi';
import { hasStationSignal } from '../lib/stationEligibility';
import type { RadioStation } from '../types/radio';

function getMapStationLimit() {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (matchMedia('(pointer: coarse)').matches || navigator.hardwareConcurrency <= 4 || memory <= 4)
    return 2500;
  return 6000;
}

export function useMapStations(
  enabled: boolean,
  catalog: RadioStation[],
  selectedStation?: RadioStation | null
) {
  const [loaded, setLoaded] = useState<RadioStation[]>([]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const limit = getMapStationLimit();
    const collected: RadioStation[] = [];
    const timer = setTimeout(async () => {
      let offset = 0;
      try {
        while (offset < limit && !controller.signal.aborted) {
          const pageSize = Math.min(1000, limit - offset);
          const page = await fetchMapStations({
            offset,
            limit: pageSize,
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          collected.push(...page.filter(hasStationSignal));
          setLoaded(dedupeFavoriteStations(collected));
          offset += page.length;
          if (page.length < pageSize) break;
        }
      } catch {
        if (!controller.signal.aborted && collected.length)
          setLoaded(dedupeFavoriteStations(collected));
      }
    }, 700);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [enabled]);

  return useMemo(
    () =>
      dedupeFavoriteStations(
        [...(selectedStation ? [selectedStation] : []), ...catalog, ...loaded].filter(
          hasStationSignal
        )
      ),
    [catalog, loaded, selectedStation]
  );
}
