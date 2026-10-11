import { geoContains, type GeoPermissibleObjects } from 'd3-geo';

export interface CountryFeature {
  type: 'Feature';
  id?: string;
  properties?: Record<string, string>;
  geometry?: unknown;
}

export function getCountryName(country: CountryFeature | null) {
  const properties = country?.properties;
  return (
    properties?.NAME_EN ||
    properties?.ADMIN ||
    properties?.NAME ||
    properties?.name ||
    properties?.SOVEREIGNT ||
    ''
  );
}

export function getCountryId(country: CountryFeature | null) {
  return country?.id ?? getCountryName(country);
}

export function getCountryAtLocation(countries: CountryFeature[], lat: number, lng: number) {
  return countries.find(
    (country) => country.geometry && geoContains(country as GeoPermissibleObjects, [lng, lat])
  );
}

export function getCountryCode(country: CountryFeature | null) {
  const properties = country?.properties;
  const candidates = [
    properties?.ISO_A2,
    properties?.ISO_A2_EH,
    properties?.ISO2,
    properties?.iso_a2,
  ];
  return (
    candidates
      .find((code) => typeof code === 'string' && /^[a-z]{2}$/i.test(code))
      ?.toUpperCase() ?? ''
  );
}
