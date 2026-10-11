import { describe, expect, it } from 'vitest';
import { createStation } from '../test/fixtures';
import type { RadioStation } from '../types/radio';
import { buildSignalJourney, getDiscoveryStations, getSurpriseStation } from './radioDiscovery';
import { getSolarPosition } from './solarPosition';

const noon = new Date('2026-03-20T12:00:00Z');
const signal = (id: string, overrides: Partial<RadioStation> = {}) =>
  createStation({
    stationuuid: id,
    name: `${id} Radio`,
    tags: 'ambient',
    geo_lat: 0,
    geo_long: 0,
    ...overrides,
  });

describe('getDiscoveryStations', () => {
  it('uses real tags and rejects unhealthy, unlocated and invalid streams', () => {
    const healthy = signal('healthy', { country: 'France', tags: 'Ambient, instrumental' });
    const results = getDiscoveryStations(
      [
        healthy,
        healthy,
        signal('offline', { lastcheckok: 0 }),
        signal('unknown-health', { lastcheckok: -1 }),
        signal('unlocated', { geo_lat: null }),
        signal('bad-position', { geo_lat: 100 }),
        signal('no-stream', { url: '', url_resolved: '' }),
        signal('bad-stream', { url_resolved: 'javascript:alert(1)' }),
        signal('wrong-mood', { name: 'Relax Ambient FM', tags: 'news' }),
      ],
      'all',
      'focus',
      'any',
      noon
    );
    expect(results.map((item) => item.station)).toEqual([healthy]);
    expect(results[0].matchedTags).toEqual(['Ambient', 'instrumental']);
    expect(results[0].reason).toContain('France');
    expect(results[0].reason).toContain('Tagged Ambient / instrumental');
  });

  it('respects the selected genre and token boundaries instead of guessing from names', () => {
    const rock = signal('rock', { tags: 'alternative rock,house' });
    const hiphop = signal('hip-hop', { tags: 'hip-hop, instrumental' });
    const jazz = signal('jazz', { tags: 'smooth jazz,acoustic' });
    const fake = signal('fake', { name: 'Jazz Rock News', tags: 'newsroom,rockabilly' });
    const candidates = [rock, hiphop, jazz, fake];
    expect(
      getDiscoveryStations(candidates, 'rock', 'energy', 'any', noon).map(({ station }) => station)
    ).toEqual([rock]);
    expect(
      getDiscoveryStations(candidates, 'hip-hop', 'focus', 'any', noon).map(
        ({ station }) => station
      )
    ).toEqual([hiphop]);
    expect(
      getDiscoveryStations(candidates, 'jazz', 'unwind', 'any', noon).map(({ station }) => station)
    ).toEqual([jazz]);
    expect(getDiscoveryStations(candidates, 'news', 'world', 'any', noon)).toEqual([]);
  });

  it('keeps valid equator and prime meridian coordinates', () => {
    const station = signal('zero', { tags: '', country: 'Ghana' });
    const results = getDiscoveryStations([station], 'all', 'world', 'any', noon);
    expect(results).toHaveLength(1);
    expect(results[0].station).toBe(station);
    expect(results[0].reason).toBe('Ghana');
  });

  it('finds sunrise at the real location and separates it from sunset as UTC advances', () => {
    const greenwich = signal('greenwich');
    expect(
      getDiscoveryStations([greenwich], 'all', 'world', 'sunrise', new Date('2026-03-20T06:00:00Z'))
    ).toHaveLength(1);
    expect(
      getDiscoveryStations([greenwich], 'all', 'world', 'sunrise', new Date('2026-03-20T18:00:00Z'))
    ).toEqual([]);
    expect(getDiscoveryStations([greenwich], 'all', 'world', 'sunrise', noon)).toEqual([]);
  });

  it('updates after-dark results with the real date and includes civil night past sunset', () => {
    const greenwich = signal('greenwich');
    expect(
      getDiscoveryStations([greenwich], 'all', 'world', 'night', new Date('2026-03-20T00:00:00Z'))
    ).toHaveLength(1);
    expect(getDiscoveryStations([greenwich], 'all', 'world', 'night', noon)).toEqual([]);
    const sun = getSolarPosition(noon);
    const dusk = signal('dusk', { geo_long: sun.lng + 97 });
    expect(getDiscoveryStations([dusk], 'all', 'world', 'night', noon)).toHaveLength(1);
  });

  it('handles seasonal polar day and polar night without inventing a sunrise', () => {
    const arctic = signal('arctic', { geo_lat: 85 });
    const summer = new Date('2026-06-21T00:00:00Z');
    const winter = new Date('2026-12-21T12:00:00Z');
    expect(getDiscoveryStations([arctic], 'all', 'world', 'night', summer)).toEqual([]);
    expect(getDiscoveryStations([arctic], 'all', 'world', 'night', winter)).toHaveLength(1);
    expect(getDiscoveryStations([arctic], 'all', 'world', 'sunrise', winter)).toEqual([]);
  });

  it('prioritizes stronger tag matches then published popularity without mutating input', () => {
    const popular = signal('popular', { clickcount: 1000, tags: 'ambient' });
    const stronger = signal('stronger', { clickcount: 1, tags: 'ambient,instrumental' });
    const candidates = [popular, stronger];
    expect(
      getDiscoveryStations(candidates, 'all', 'focus', 'any', noon).map(({ station }) => station)
    ).toEqual([stronger, popular]);
    expect(candidates).toEqual([popular, stronger]);
  });
});

describe('buildSignalJourney', () => {
  it('starts at the selected candidate, prefers different countries and stops at six', () => {
    const stations = [
      signal('fr-one', { countrycode: 'FR', geo_long: 2 }),
      signal('fr-two', { countrycode: 'FR', geo_long: 3 }),
      signal('gb', { countrycode: 'GB', geo_long: -1 }),
      signal('de', { countrycode: 'DE', geo_long: 10 }),
      signal('it', { countrycode: 'IT', geo_long: 12 }),
      signal('es', { countrycode: 'ES', geo_long: -3 }),
      signal('us', { countrycode: 'US', geo_long: -100 }),
      signal('jp', { countrycode: 'JP', geo_long: 135 }),
    ];
    const route = buildSignalJourney(stations, stations[2]);
    expect(route).toHaveLength(6);
    expect(route[0]).toBe(stations[2]);
    expect(new Set(route.map((station) => station.countrycode)).size).toBe(6);
    expect(new Set(route.map((station) => station.stationuuid)).size).toBe(6);
    expect(route.every((station) => stations.includes(station))).toBe(true);
    expect(stations[0].stationuuid).toBe('fr-one');
  });

  it('uses country names when country codes are missing and fills a small route honestly', () => {
    const france = signal('fr', { country: 'France', countrycode: '' });
    const germany = signal('de', { country: 'Germany', countrycode: '', geo_long: 5 });
    const anotherFrance = signal('fr-two', { country: 'France', countrycode: '', geo_long: 1 });
    expect(buildSignalJourney([france, anotherFrance, germany])).toEqual([
      france,
      germany,
      anotherFrance,
    ]);
    expect(buildSignalJourney([france, france])).toEqual([france]);
    expect(buildSignalJourney([])).toEqual([]);
    expect(buildSignalJourney([signal('offline', { lastcheckok: 0 })])).toEqual([]);
  });

  it('takes the nearer different country across the antimeridian and ignores an unrelated start', () => {
    const start = signal('start', { countrycode: 'JP', geo_long: 179 });
    const near = signal('near', { countrycode: 'US', geo_long: -179 });
    const far = signal('far', { countrycode: 'DE', geo_long: 10 });
    expect(
      buildSignalJourney([start, far, near], signal('unrelated')).map(
        (station) => station.stationuuid
      )
    ).toEqual(['start', 'near', 'far']);
  });
});

describe('getSurpriseStation', () => {
  it('does not repeat until every candidate has been visited, then avoids the current signal', () => {
    const stations = ['one', 'two', 'three', 'four'].map((id) => signal(id));
    let history: string[] = [];
    let current: RadioStation | null = null;
    const discovered: string[] = [];
    for (let index = 0; index < stations.length; index += 1) {
      const result = getSurpriseStation(stations, history, current, () => 0.5);
      current = result.station;
      history = result.seenStationIds;
      discovered.push(current!.stationuuid);
    }
    expect(new Set(discovered).size).toBe(stations.length);
    const next = getSurpriseStation(stations, history, current, () => 0.5);
    expect(next.station).not.toBe(current);
    expect(next.seenStationIds).toHaveLength(1);
  });

  it('starts a new surprise round when the only unvisited signal was manually selected', () => {
    const first = signal('first');
    const second = signal('second');
    const result = getSurpriseStation([first, second], ['id:second'], first, () => 0);
    expect(result.station).toBe(second);
    expect(result.seenStationIds).toEqual(['id:second']);
  });

  it('counts a manually selected candidate as visited while exploring remaining signals', () => {
    const first = signal('first');
    const second = signal('second');
    const third = signal('third');
    const result = getSurpriseStation([first, second, third], ['id:second'], first, () => 0);
    expect(result.station).toBe(third);
    expect(result.seenStationIds).toEqual(['id:second', 'id:first', 'id:third']);
  });

  it('does not count an unavailable or out-of-pool current station as visited', () => {
    const first = signal('first');
    const second = signal('second');
    const unavailable = signal('first', { lastcheckok: 0 });
    const failedCurrent = getSurpriseStation([first, second], [], unavailable, () => 0);
    expect(failedCurrent.station).toBe(first);
    expect(failedCurrent.seenStationIds).toEqual(['id:first']);
    const unrelated = getSurpriseStation([first, second], [], signal('elsewhere'), () => 0);
    expect(unrelated.station).toBe(first);
    expect(unrelated.seenStationIds).toEqual(['id:first']);
  });

  it('accepts a single signal and empty or invalid candidate sets safely', () => {
    const station = signal('only');
    const previous = ['only'];
    expect(getSurpriseStation([station], previous, station, () => 1).station).toBe(station);
    expect(previous).toEqual(['only']);
    expect(getSurpriseStation([], previous, station)).toEqual({
      station: null,
      seenStationIds: [],
    });
    expect(getSurpriseStation([signal('bad', { geo_long: null })], [], null).station).toBeNull();
  });
});
