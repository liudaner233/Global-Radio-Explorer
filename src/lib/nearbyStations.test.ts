import { createStation } from '../test/fixtures';
import { createNearbyFinder } from './nearbyStations';

describe('nearby stations', () => {
  it('orders real stations by distance from the center, including zero coordinates', () => {
    const stations = [
      createStation({ stationuuid: 'far', geo_lat: 0, geo_long: 2 }),
      createStation({ stationuuid: 'center', geo_lat: 0, geo_long: 0 }),
      createStation({ stationuuid: 'near', geo_lat: 0, geo_long: 1 }),
    ];
    const find = createNearbyFinder(stations);
    const nearby = find(0, 0, 2);
    expect(nearby.map(({ station }) => station.stationuuid)).toEqual(['center', 'near']);
    expect(nearby[0].distance).toBe(0);
    expect(nearby[1].distance).toBeCloseTo(111.19, 1);
    expect(find(0, 2)[0].station.stationuuid).toBe('far');
  });

  it('handles the international date line and filters invalid or broken streams', () => {
    const stations = [
      createStation({ stationuuid: 'across', geo_lat: 0, geo_long: -179 }),
      createStation({ stationuuid: 'far', geo_lat: 0, geo_long: 150 }),
      createStation({ stationuuid: 'broken', geo_lat: 0, geo_long: 179, lastcheckok: 0 }),
      createStation({ stationuuid: 'invalid', geo_lat: 91, geo_long: 179 }),
      createStation({
        stationuuid: 'no-stream',
        geo_lat: 0,
        geo_long: 179,
        url: '',
        url_resolved: '',
      }),
    ];
    const nearby = createNearbyFinder(stations)(0, 179);
    expect(nearby.map(({ station }) => station.stationuuid)).toEqual(['across', 'far']);
    expect(nearby[0].distance).toBeCloseTo(222.39, 1);
  });

  it('matches complete tags and common hip-hop spelling without substring matches', () => {
    const stations = [
      createStation({ stationuuid: 'jazz', geo_lat: 20, geo_long: 0, tags: 'news,Jazz' }),
      createStation({ stationuuid: 'hip', geo_lat: 20, geo_long: 0, tags: 'Hip-Hop,pop' }),
      createStation({ stationuuid: 'other', geo_lat: 20, geo_long: 0, tags: 'jazzrock' }),
    ];
    expect(
      createNearbyFinder(stations, 'jazz')(20, 0).map(({ station }) => station.stationuuid)
    ).toEqual(['jazz']);
    expect(
      createNearbyFinder(stations, 'hip-hop')(20, 0).map(({ station }) => station.stationuuid)
    ).toEqual(['hip']);
  });
});
