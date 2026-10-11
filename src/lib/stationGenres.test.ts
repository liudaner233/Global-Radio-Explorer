import {
  getStationGenre,
  getStationSignalGenre,
  matchesStationGenre,
  stationGenres,
} from './stationGenres';

describe('station genre signals', () => {
  it('keeps one unique six-digit color for every existing category', () => {
    expect(stationGenres.map(({ id }) => id)).toEqual([
      'all',
      'pop',
      'rock',
      'news',
      'dance',
      'electronic',
      'hip-hop',
      'jazz',
      'classical',
      'country',
      'latin',
      'soul',
      'reggae',
      'sports',
      'talk',
    ]);
    expect(new Set(stationGenres.map(({ color }) => color)).size).toBe(stationGenres.length);
    expect(getStationGenre('all').color).toBe('#5ee3ae');
    for (const genre of stationGenres) {
      expect(genre.color).toMatch(/^#[a-f0-9]{6}$/);
      expect(getStationGenre(genre.id)).toBe(genre);
      expect(matchesStationGenre({ tags: genre.tag }, genre.id)).toBe(true);
      expect(getStationSignalGenre({ tags: genre.tag }).color).toBe(genre.color);
    }
  });

  it('uses declared tag order instead of category order for the primary color', () => {
    expect(getStationSignalGenre({ tags: 'unknown,Classical,jazz,pop' }).id).toBe('classical');
    expect(getStationSignalGenre({ tags: ' jazz,Classical,pop' }).id).toBe('jazz');
    expect(getStationSignalGenre({ tags: 'News,Talk' }).id).toBe('news');
    expect(getStationSignalGenre({ tags: 'Talk,News' }).id).toBe('talk');
  });

  it('prioritizes the selected category only when the station actually matches it', () => {
    const station = { tags: 'jazz,news,hip-hop' };
    expect(getStationSignalGenre(station, 'hip-hop')).toBe(getStationGenre('hip-hop'));
    expect(getStationSignalGenre(station, 'news')).toBe(getStationGenre('news'));
    expect(getStationSignalGenre(station, 'country')).toBe(getStationGenre('jazz'));
    expect(getStationSignalGenre(station, 'all')).toBe(getStationGenre('jazz'));
  });

  it.each([
    ['HIP-HOP', 'hip-hop'],
    ['hiphop', 'hip-hop'],
    ['hip   hop', 'hip-hop'],
    ['rap', 'hip-hop'],
    ['R&B', 'soul'],
    ['rnb', 'soul'],
    ["R'n'B", 'soul'],
    ['Rhythm and Blues', 'soul'],
    ['neo-soul', 'soul'],
    ['electronica', 'electronic'],
    ['Electrónica', 'electronic'],
    ['electronic music', 'electronic'],
    ['EDM', 'electronic'],
    ['deep house', 'electronic'],
    ['techno', 'electronic'],
    ['trance', 'electronic'],
    ['drum & bass', 'electronic'],
    ['drum and bass', 'electronic'],
    ['drum n bass', 'electronic'],
    ['synthwave', 'electronic'],
    ['sport', 'sports'],
    ['talkradio', 'talk'],
  ] as const)('recognizes the declared alias %s as %s', (tags, genre) => {
    expect(matchesStationGenre({ tags }, genre)).toBe(true);
    expect(getStationSignalGenre({ tags }).id).toBe(genre);
  });

  it.each([
    ['popular', 'pop'],
    ['countrycode', 'country'],
    ['jazzrock', 'jazz'],
    ['jazzrock', 'rock'],
    ['newspaper', 'news'],
    ['soulful', 'soul'],
    ['sportswear', 'sports'],
    ['hiphopper', 'hip-hop'],
    ['household', 'electronic'],
  ] as const)('does not infer %s from a partial %s tag', (tags, genre) => {
    expect(matchesStationGenre({ tags }, genre)).toBe(false);
    expect(getStationSignalGenre({ tags }).id).toBe('all');
  });

  it('supports complete genre words inside a compound tag', () => {
    expect(matchesStationGenre({ tags: 'classic rock' }, 'rock')).toBe(true);
    expect(matchesStationGenre({ tags: 'classic rock' }, 'classical')).toBe(false);
    expect(matchesStationGenre({ tags: 'indie-pop' }, 'pop')).toBe(true);
    expect(matchesStationGenre({ tags: 'alternative_country' }, 'country')).toBe(true);
  });

  it.each(['', 'unknown,online', '、、、', 'popular,countrycode'])(
    'uses the neutral green for unclassified tags %s',
    (tags) => {
      expect(getStationSignalGenre({ tags })).toBe(getStationGenre('all'));
      expect(getStationSignalGenre({ tags }, 'jazz')).toBe(getStationGenre('all'));
      expect(matchesStationGenre({ tags }, 'all')).toBe(true);
    }
  );
});
