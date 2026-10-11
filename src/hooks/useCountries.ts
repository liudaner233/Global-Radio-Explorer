import { useEffect, useState } from 'react';
import type { CountryFeature } from '../lib/countries';
import { fetchJsonWithTimeout } from '../lib/radioApi';

const COUNTRIES_URL = `${import.meta.env.BASE_URL}maps/countries.geojson`;

export function useCountries() {
  const [countries, setCountries] = useState<CountryFeature[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function loadCountries() {
      try {
        const data = await fetchJsonWithTimeout<{ features?: CountryFeature[] }>(COUNTRIES_URL, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setCountries(data.features ?? []);
        setError(false);
      } catch {
        if (controller.signal.aborted) return;
        setCountries([]);
        setError(true);
      }
    }
    void loadCountries();
    return () => controller.abort();
  }, []);

  return { countries, error };
}
