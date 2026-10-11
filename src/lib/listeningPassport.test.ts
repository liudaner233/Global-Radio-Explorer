import { createStation } from '../test/fixtures';
import {
  createListeningPassport,
  formatListeningDuration,
  LISTENING_PASSPORT_STORAGE_KEY,
  normalizeListeningPassport,
  readListeningPassport,
  recordPassportListening,
  writeListeningPassport,
} from './listeningPassport';

describe('listening passport data', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('records positive progress and deduplicates stations and countries', () => {
    const station = createStation({ name: 'Paris FM', country: 'France', countrycode: 'fr' });
    const first = recordPassportListening(createListeningPassport(), station, 0.25, 1_000);
    const second = recordPassportListening(first, station, 2.5, 2_000);
    expect(first.totalSeconds).toBe(0.25);
    expect(second.totalSeconds).toBe(2.75);
    expect(second.recent).toHaveLength(1);
    expect(second.recent[0]).toMatchObject({ seconds: 2.75, lastListenedAt: 2_000 });
    expect(second.countries).toEqual([
      {
        id: 'country:FR',
        name: 'France',
        code: 'FR',
        seconds: 2.75,
        firstListenedAt: 1_000,
        lastListenedAt: 2_000,
      },
    ]);
  });

  it('updates replay metadata, orders by most recent listening, and limits recent stations', () => {
    let passport = createListeningPassport();
    for (let index = 0; index < 25; index++) {
      passport = recordPassportListening(
        passport,
        createStation({ stationuuid: `station-${index}`, name: `Station ${index}` }),
        1,
        1_000 + index
      );
    }
    expect(passport.recent).toHaveLength(20);
    expect(passport.recent[0].station.stationuuid).toBe('station-24');
    const replay = recordPassportListening(
      passport,
      createStation({ stationuuid: 'station-8', name: 'Updated Station 8' }),
      2,
      2_000
    );
    expect(replay.recent[0]).toMatchObject({ seconds: 3, station: { name: 'Updated Station 8' } });
    expect(replay.recent).toHaveLength(20);
    expect(replay.totalSeconds).toBe(27);
  });

  it('ignores invalid progress and stations without an actual stream', () => {
    const passport = createListeningPassport();
    const station = createStation();
    for (const seconds of [0, -1, NaN, Infinity]) {
      expect(recordPassportListening(passport, station, seconds)).toBe(passport);
    }
    expect(recordPassportListening(passport, createStation({ name: '' }), 1)).toBe(passport);
    expect(
      recordPassportListening(
        passport,
        createStation({ url: '', url_resolved: 'javascript:alert(1)' }),
        1
      )
    ).toBe(passport);
    expect(recordPassportListening(passport, station, 1, Infinity)).toBe(passport);
  });

  it('does not invent a country when the station has no country metadata', () => {
    const passport = recordPassportListening(
      createListeningPassport(),
      createStation({ country: '', countrycode: '' }),
      1
    );
    expect(passport.totalSeconds).toBe(1);
    expect(passport.countries).toEqual([]);
    expect(passport.recent).toHaveLength(1);
  });

  it('keeps one country stamp when previously missing ISO metadata becomes available', () => {
    const first = recordPassportListening(
      createListeningPassport(),
      createStation({ country: 'France', countrycode: '' }),
      1,
      100
    );
    const next = recordPassportListening(
      first,
      createStation({ country: 'France', countrycode: 'FR' }),
      2,
      200
    );
    const revisited = recordPassportListening(
      next,
      createStation({ country: 'France', countrycode: '' }),
      3,
      300
    );
    expect(revisited.countries).toHaveLength(1);
    expect(revisited.countries[0]).toMatchObject({ id: 'country:FR', code: 'FR', seconds: 6 });
  });

  it('rejects corrupt schemas and removes invalid and duplicate records from storage', () => {
    for (const value of [
      null,
      [],
      { version: 2, totalSeconds: 1 },
      { version: 1, totalSeconds: -5 },
    ]) {
      expect(normalizeListeningPassport(value)).toEqual(createListeningPassport());
    }
    const passport = recordPassportListening(createListeningPassport(), createStation(), 10, 100);
    const normalized = normalizeListeningPassport({
      ...passport,
      recent: [
        null,
        ...passport.recent,
        ...passport.recent,
        { ...passport.recent[0], seconds: 100 },
      ],
      countries: [
        ...passport.countries,
        ...passport.countries,
        { ...passport.countries[0], lastListenedAt: 9_000_000_000_000_000 },
      ],
    });
    expect(normalized).toEqual(passport);
    localStorage.setItem(LISTENING_PASSPORT_STORAGE_KEY, '{broken');
    expect(readListeningPassport()).toEqual(createListeningPassport());
  });

  it('round trips real records and remains usable when storage access is blocked', () => {
    const passport = recordPassportListening(createListeningPassport(), createStation(), 10, 100);
    writeListeningPassport(passport);
    expect(readListeningPassport()).toEqual(passport);
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Storage disabled', 'SecurityError');
    });
    expect(readListeningPassport()).toEqual(createListeningPassport());
    expect(() => writeListeningPassport(passport)).not.toThrow();
  });

  it('formats recorded duration without rounding it upward', () => {
    expect(formatListeningDuration(0.9)).toBe('0s');
    expect(formatListeningDuration(65.9)).toBe('1m 5s');
    expect(formatListeningDuration(3_665)).toBe('1h 1m');
    expect(formatListeningDuration(NaN)).toBe('0s');
  });
});
