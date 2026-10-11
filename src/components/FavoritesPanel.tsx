import { useState } from 'react';
import { Heart, Globe, Radio, Search, X } from 'lucide-react';
import type { RadioStation } from '../types/radio';
import { getStationIdentity } from '../lib/favorites';
import { cn } from '../lib/utils';
import StationArtwork from './StationArtwork';

interface FavoritesPanelProps {
  favorites: RadioStation[];
  selectedStation: RadioStation | null;
  onSelectStation: (station: RadioStation) => void;
  onToggleFavorite: (station: RadioStation) => void;
}

export default function FavoritesPanel({
  favorites,
  selectedStation,
  onSelectStation,
  onToggleFavorite,
}: FavoritesPanelProps) {
  const [query, setQuery] = useState('');
  const visible = favorites.filter((station) =>
    `${station.name} ${station.country} ${station.tags}`
      .toLowerCase()
      .includes(query.trim().toLowerCase())
  );
  return (
    <section
      aria-label="Favorite radio stations"
      className="radio-panel flex h-full w-[min(17.5rem,calc(100vw-5rem))] flex-col overflow-hidden rounded-3xl"
    >
      <div className="border-b border-white/[0.06] px-4 pb-4 pt-5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-rose-300/15 bg-rose-300/[0.06]">
            <Heart className="h-4 w-4 text-rose-200/80" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-white/90">Liked Channels</h2>
            <p className="mt-1 text-[9px] font-medium uppercase tracking-[0.18em] text-white/35">
              Your listening shelf
            </p>
          </div>
          <span className="ml-auto rounded-full border border-white/10 px-2 py-0.5 text-[10px] tabular-nums text-white/45">
            {favorites.length}
          </span>
        </div>
        {favorites.length > 0 && (
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
            <input
              type="search"
              aria-label="Filter favorites"
              placeholder="Filter favorites..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.035] py-2 pl-9 pr-3 text-xs text-white placeholder:text-white/30 focus:border-rose-300/30 focus:outline-none"
            />
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        {favorites.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.02]">
              <Heart className="h-6 w-6 text-rose-200/25" />
            </div>
            <p className="text-sm text-white/60 font-medium">No liked channels yet</p>
            <p className="text-xs text-white/35 mt-1">
              Tap the heart icon in the station list to add favorites.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {visible.length === 0 && (
              <p className="px-4 py-8 text-center text-xs text-white/40">
                No favorites match this search.
              </p>
            )}
            {visible.map((station) => {
              const status =
                station.lastcheckok === 1
                  ? 'Live'
                  : station.lastcheckok === 0
                    ? 'Unavailable'
                    : 'Not checked';
              return (
                <div
                  key={getStationIdentity(station)}
                  className={cn(
                    'rounded-xl border transition-colors',
                    getStationIdentity(selectedStation) === getStationIdentity(station)
                      ? 'bg-blue-400/10 border-blue-300/20'
                      : 'border-transparent hover:bg-white/[0.045]'
                  )}
                >
                  <div className="flex items-center gap-2 p-2.5">
                    <button
                      onClick={() => onSelectStation(station)}
                      className="flex-1 min-w-0 flex items-center gap-3 text-left"
                    >
                      <StationArtwork station={station} className="h-9 w-9 rounded-lg" />
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate text-[13px] font-medium text-white/90">
                          {station.name}
                        </h4>
                        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-white/35 uppercase tracking-wider font-bold">
                          <span className="flex items-center gap-0.5">
                            <Globe className="w-2.5 h-2.5" />
                            {station.countrycode || station.country || '--'}
                          </span>
                          {station.bitrate > 0 && (
                            <span className="flex items-center gap-0.5">
                              <Radio className="w-2.5 h-2.5" />
                              {station.bitrate}k
                            </span>
                          )}
                          <span
                            className={cn(
                              'rounded-full px-1.5 py-0.5 text-[9px]',
                              status === 'Live' && 'text-emerald-300 bg-emerald-500/10',
                              status === 'Unavailable' && 'text-amber-200 bg-amber-500/10',
                              status === 'Not checked' && 'text-white/60 bg-white/10'
                            )}
                          >
                            {status}
                          </span>
                        </div>
                      </div>
                    </button>

                    <button
                      onClick={() => onToggleFavorite(station)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/25 transition-colors hover:bg-rose-300/10 hover:text-rose-200"
                      aria-label="Remove favorite"
                      title="Remove from favorites"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="border-t border-white/[0.06] px-4 py-2.5 text-[10px] text-white/30">
        Saved on this device · Always within reach
      </div>
    </section>
  );
}
