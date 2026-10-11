import { getCountryAtLocation, type CountryFeature } from './countries';

const country: CountryFeature = {
  type: 'Feature',
  properties: { NAME_EN: 'France', ISO_A2: 'FR' },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [-5, 40],
        [-5, 52],
        [10, 52],
        [10, 40],
        [-5, 40],
      ],
    ],
  },
};

it('resolves a country from globe coordinates and leaves ocean clicks unselected', () => {
  const countries = [{ type: 'Feature' as const }, country];
  expect(getCountryAtLocation(countries, 48, 2)).toBe(country);
  expect(getCountryAtLocation(countries, 20, -40)).toBeUndefined();
});
