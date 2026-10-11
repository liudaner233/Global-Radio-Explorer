import type { RadioStation } from '../types/radio';

export const stationGenres = [
  { id: 'all', label: 'All', tag: '', color: '#5ee3ae' },
  { id: 'pop', label: 'Pop', tag: 'pop', color: '#f472b6' },
  { id: 'rock', label: 'Rock', tag: 'rock', color: '#fb7185' },
  { id: 'news', label: 'News', tag: 'news', color: '#60a5fa' },
  { id: 'dance', label: 'Dance', tag: 'dance', color: '#c084fc' },
  { id: 'electronic', label: 'Electronic', tag: 'electronic', color: '#22d3ee' },
  { id: 'hip-hop', label: 'Hip-Hop', tag: 'hip hop', color: '#fb923c' },
  { id: 'jazz', label: 'Jazz', tag: 'jazz', color: '#fbbf24' },
  { id: 'classical', label: 'Classical', tag: 'classical', color: '#a5b4fc' },
  { id: 'country', label: 'Country', tag: 'country', color: '#d6b080' },
  { id: 'latin', label: 'Latin', tag: 'latin', color: '#f97316' },
  { id: 'soul', label: 'R&B & Soul', tag: 'soul', color: '#e879b0' },
  { id: 'reggae', label: 'Reggae', tag: 'reggae', color: '#a3e635' },
  { id: 'sports', label: 'Sports', tag: 'sports', color: '#2dd4bf' },
  { id: 'talk', label: 'Talk', tag: 'talk', color: '#7dd3fc' },
] as const;

export type StationGenre = (typeof stationGenres)[number]['id'];

const genreTags: Record<Exclude<StationGenre, 'all'>, readonly string[]> = {
  pop: ['pop', 'kpop', 'jpop', 'synthpop'],
  rock: ['rock'],
  news: ['news'],
  dance: ['dance', 'disco'],
  electronic: [
    'electronic',
    'electronica',
    'electro',
    'edm',
    'house',
    'techno',
    'trance',
    'dubstep',
    'drum and bass',
    'drum bass',
    'drum n bass',
    'dnb',
    'synthwave',
  ],
  'hip-hop': ['hip hop', 'hiphop', 'rap'],
  jazz: ['jazz'],
  classical: ['classical'],
  country: ['country'],
  latin: ['latin', 'latino'],
  soul: ['soul', 'r b', 'rnb', 'r and b', 'r n b', 'rhythm and blues'],
  reggae: ['reggae'],
  sports: ['sports', 'sport'],
  talk: ['talk', 'talkradio'],
};

function normalizeTag(tag: string) {
  return tag
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function matchesGenreTag(tag: string, genre: Exclude<StationGenre, 'all'>) {
  const words = ` ${tag} `;
  return genreTags[genre].some((term) => words.includes(` ${term} `));
}

function matchesGenreTags(tags: readonly string[], genre: StationGenre) {
  return genre === 'all' || tags.some((tag) => matchesGenreTag(tag, genre));
}

export function getStationGenre(id: StationGenre) {
  return stationGenres.find((genre) => genre.id === id)!;
}

export function matchesStationGenre(station: Pick<RadioStation, 'tags'>, genre: StationGenre) {
  return genre === 'all' || matchesGenreTags(station.tags.split(',').map(normalizeTag), genre);
}

export function getStationSignalGenre(
  station: Pick<RadioStation, 'tags'>,
  activeGenre: StationGenre = 'all'
) {
  const tags = station.tags.split(',').map(normalizeTag);
  if (activeGenre !== 'all' && matchesGenreTags(tags, activeGenre)) {
    return getStationGenre(activeGenre);
  }
  for (const tag of tags) {
    const genre = stationGenres.find(
      (candidate) => candidate.id !== 'all' && matchesGenreTag(tag, candidate.id)
    );
    if (genre) return genre;
  }
  return getStationGenre('all');
}
