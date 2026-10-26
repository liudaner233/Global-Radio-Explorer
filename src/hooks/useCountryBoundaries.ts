import { useEffect, useRef, type RefObject } from 'react';
import type { GlobeMethods } from 'react-globe.gl';
import type { CountryFeature } from '../lib/countries';
import { createCountryBoundaryLayer } from '../lib/countryBoundaryLayer';

export function useCountryBoundaries(
  globeRef: RefObject<GlobeMethods | undefined>,
  ready: boolean,
  countries: CountryFeature[],
  detailed: boolean
) {
  const layer = useRef<ReturnType<typeof createCountryBoundaryLayer> | null>(null);
  const detailedRef = useRef(detailed);

  useEffect(() => {
    detailedRef.current = detailed;
    layer.current?.setDetailed(detailed);
  }, [detailed]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!ready || !globe || !countries.length) return;
    const controller = createCountryBoundaryLayer(globe, countries, detailedRef.current);
    layer.current = controller;
    return () => {
      controller.dispose();
      layer.current = null;
    };
  }, [globeRef, ready, countries]);
}
