import { useState } from 'react';
import { Loader2, Radio, Search, X, SlidersHorizontal } from 'lucide-react';
import { getStationIdentity } from '../lib/favorites';
import { cn } from '../lib/utils';
import type { StationCatalog } from '../hooks/useStationCatalog';
import type { RadioStation } from '../types/radio';
import StationListItem from './StationListItem';
import { stationGenres, getStationGenre } from '../lib/stationGenres';
import type { NearbyStation } from '../lib/nearbyStations';
import DiscoveryPanel from './DiscoveryPanel';
import SignalJourney from './SignalJourney';

interface SidebarProps {
  catalog: StationCatalog;
  selectedStation: RadioStation | null;
  onSelectStation: (station: RadioStation) => void;
  onToggleFavorite: (station: RadioStation) => void;
  isFavorite: (station: RadioStation) => boolean;
  nearbyStations?: NearbyStation[] | null;
  discoveryStations?: RadioStation[];
  active?: boolean;
  onStartJourney: (stations: RadioStation[]) => void;
  journey?: {
    route: RadioStation[];
    index: number;
    goTo: (index: number) => void;
    end: () => void;
  };
}

const tabs = [
  { value: 'trending', label: 'Trending' },
  { value: 'nearby', label: 'Nearby' },
  { value: 'discover', label: 'Discover' },
  { value: 'search', label: 'Results' },
] as const;

export default function Sidebar({
  catalog,
  selectedStation,
  onSelectStation,
  onToggleFavorite,
  isFavorite,
  nearbyStations = null,
  discoveryStations = [],
  active = true,
  onStartJourney,
  journey,
}: SidebarProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const selectedId = getStationIdentity(selectedStation);
  const nearby = catalog.tab === 'nearby';
  const stations = nearby ? (nearbyStations || []).map((item) => item.station) : catalog.stations;
  const loading = nearby ? nearbyStations === null : catalog.loading;
  const error = nearby ? null : catalog.error;

  function renderStations() {
    if (loading && stations.length === 0)
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-white/40">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <p className="text-sm font-medium">
            {nearby
              ? 'Locating nearby signals...'
              : catalog.initializing
                ? 'Loading stations...'
                : 'Tuning in...'}
          </p>
        </div>
      );
    if (error && stations.length === 0)
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
          <Radio className="h-12 w-12 text-red-300/70" />
          <div className="space-y-2">
            <p className="text-sm font-medium text-white">{error}</p>
            <p className="text-xs text-white/45">
              Retry to restore the station list and continue browsing.
            </p>
          </div>
          <button
            onClick={catalog.retry}
            className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm text-white transition-colors hover:bg-white/15"
          >
            Retry loading stations
          </button>
        </div>
      );
    if (catalog.tab === 'search' && !catalog.query.trim())
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-white/30">
          <Search className="h-12 w-12 opacity-20" />
          <p className="text-sm">Enter a station name to search the catalog.</p>
        </div>
      );
    if (stations.length === 0)
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-white/20 p-8 text-center">
          <Radio className="w-12 h-12 opacity-10" />
          <p className="text-sm">
            {nearby
              ? 'No matching signals near this view yet. Try All or move the globe.'
              : catalog.tab === 'search'
                ? 'No stations found for this search. Try another keyword.'
                : 'No stations available right now. Please retry in a moment.'}
          </p>
          {catalog.tab === 'trending' && (
            <button
              onClick={catalog.retry}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              Retry loading stations
            </button>
          )}
        </div>
      );
    return (
      <div className="space-y-1">
        {error && (
          <button
            onClick={catalog.retry}
            className="w-full rounded-xl bg-amber-300/10 px-3 py-2 text-xs text-amber-200"
          >
            Refresh failed · Retry
          </button>
        )}
        {stations.map((station, index) => {
          const id = getStationIdentity(station);
          return (
            <StationListItem
              key={id}
              station={station}
              selected={id === selectedId}
              favorite={isFavorite(station)}
              expanded={id === expandedId}
              distance={nearby ? nearbyStations?.[index].distance : undefined}
              onSelect={() => onSelectStation(station)}
              onToggleFavorite={() => onToggleFavorite(station)}
              onToggleDetails={() => setExpandedId((current) => (current === id ? null : id))}
            />
          );
        })}
      </div>
    );
  }

  return (
    <section
      aria-label="Discover radio stations"
      className="radio-panel flex h-full w-[min(20rem,calc(100vw-5rem))] flex-col overflow-hidden rounded-3xl md:w-80"
    >
      <div className="border-b border-white/[0.06] px-4 pb-4 pt-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-blue-300/65">
              Discover / Worldwide
            </p>
            <h2 className="text-base font-semibold tracking-tight text-white/95">Radio Explorer</h2>
          </div>
          <Radio className="h-5 w-5 text-blue-300/60" />
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            catalog.submitSearch();
          }}
          className="relative"
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            id="station-search"
            type="text"
            placeholder="Search stations..."
            aria-label="Search stations"
            value={catalog.query}
            onChange={(event) => catalog.changeQuery(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/[0.035] py-2.5 pl-10 pr-9 text-sm text-white placeholder:text-white/35 transition-colors focus:border-blue-300/40 focus:bg-white/[0.06] focus:outline-none"
          />
          {catalog.query && (
            <button
              type="button"
              onClick={() => catalog.changeQuery('')}
              aria-label="Clear station search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-white/40 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </form>
        <div className="mb-2 mt-4 flex items-center gap-1.5 text-[10px] font-medium text-white/35">
          <SlidersHorizontal className="h-3 w-3" />
          Browse by sound
          <span
            className="ml-auto"
            style={
              catalog.genre === 'all' ? undefined : { color: getStationGenre(catalog.genre).color }
            }
          >
            {catalog.genre === 'all'
              ? 'Mixed colors'
              : `${getStationGenre(catalog.genre).label} signals`}
          </span>
        </div>
        {catalog.tab === 'discover' ? (
          <div className="relative">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full"
              style={{ backgroundColor: getStationGenre(catalog.genre).color }}
            />
            <select
              aria-label="Discovery genre"
              value={catalog.genre}
              onChange={(event) => catalog.changeGenre(event.target.value as typeof catalog.genre)}
              className="w-full rounded-xl border border-white/10 bg-[#121923] py-2 pl-7 pr-3 text-xs text-white/75 outline-none focus:border-blue-300/40"
            >
              {stationGenres.map((genre) => (
                <option key={genre.id} value={genre.id}>
                  {genre.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div
            aria-label="Station categories"
            role="group"
            className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto overscroll-contain"
          >
            {stationGenres.map((genre) => (
              <button
                key={genre.id}
                onClick={() => catalog.changeGenre(genre.id)}
                aria-pressed={catalog.genre === genre.id}
                style={
                  catalog.genre === genre.id
                    ? {
                        borderColor: `${genre.color}66`,
                        backgroundColor: `${genre.color}1a`,
                        color: genre.color,
                      }
                    : undefined
                }
                title={`${genre.label} station signals`}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                  catalog.genre === genre.id
                    ? 'border-blue-400/30 bg-blue-400/15 text-blue-200'
                    : 'border-white/[0.07] bg-white/[0.025] text-white/50 hover:border-white/20 hover:text-white/90'
                )}
              >
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: genre.color }}
                />
                {genre.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-4 gap-1 border-b border-white/[0.06] px-3 py-2">
        {tabs.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => catalog.changeTab(value)}
            aria-pressed={catalog.tab === value}
            className={cn(
              'min-w-0 rounded-lg px-1 py-1.5 text-[11px] font-medium transition-colors',
              catalog.tab === value
                ? 'bg-white/[0.06] text-blue-200'
                : 'text-white/40 hover:text-white/70'
            )}
          >
            {label}
          </button>
        ))}
        <span className="sr-only" role="status">
          {loading ? 'Updating' : `${stations.length} stations`}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        {journey && (
          <SignalJourney
            route={journey.route}
            index={journey.index}
            onGoTo={journey.goTo}
            onEnd={journey.end}
          />
        )}
        <div hidden={catalog.tab !== 'discover'}>
          <DiscoveryPanel
            active={active && catalog.tab === 'discover'}
            stations={discoveryStations}
            genre={catalog.genre}
            selectedStation={selectedStation}
            loading={catalog.initializing && !discoveryStations.length}
            onSelectStation={onSelectStation}
            onStartJourney={onStartJourney}
          />
        </div>
        {catalog.tab !== 'discover' && renderStations()}
      </div>
      <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-2.5 text-[10px] text-white/35">
        <span className="flex items-center gap-1.5">
          <span className="h-1 w-1 rounded-full bg-emerald-300/75" />
          {nearby
            ? 'Near the map center'
            : catalog.tab === 'discover'
              ? 'Curated by tags'
              : 'Global signals'}
        </span>
        <span>
          {getStationGenre(catalog.genre).label} ·{' '}
          {catalog.tab === 'discover' ? discoveryStations.length : stations.length}
        </span>
      </div>
    </section>
  );
}
