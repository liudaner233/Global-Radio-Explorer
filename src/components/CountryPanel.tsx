import { useEffect } from 'react';
import { Loader2, Play, X } from 'lucide-react';
import { getStationIdentity } from '../lib/favorites';
import type { RadioStation } from '../types/radio';

interface CountryPanelProps {
  name: string;
  stations: RadioStation[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  boundaryError: boolean;
  onRetry: () => void;
  onLoadMore: () => void;
  onClose: () => void;
  onSelectStation: (station: RadioStation) => void;
}

export default function CountryPanel({
  name,
  stations,
  error,
  loading,
  loadingMore,
  hasMore,
  boundaryError,
  onRetry,
  onLoadMore,
  onClose,
  onSelectStation,
}: CountryPanelProps) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div
        role="region"
        aria-label={`${name || 'Unknown Region'} radio stations`}
        className="radio-panel pointer-events-auto absolute left-1/2 top-24 flex max-h-[min(32rem,calc(100dvh-var(--player-height,0px)-7.5rem))] w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-2xl"
      >
        <div className="flex shrink-0 items-start justify-between border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-blue-300/80">Country</p>
            <h3 className="country-title mt-1 text-sm text-white">{name || 'Unknown Region'}</h3>
            {!loading && !error && (
              <p className="mt-1 text-xs text-white/50">
                {stations.length} stations loaded · Most popular first
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close country stations"
            className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 max-h-[19rem] overflow-y-auto overscroll-contain px-3 py-3">
          {loading ? (
            <p role="status" className="flex items-center gap-2 px-2 py-6 text-sm text-blue-200">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading stations for {name}...
            </p>
          ) : stations.length > 0 ? (
            <div className="space-y-2">
              {stations.map((station) => (
                <button
                  key={getStationIdentity(station)}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectStation(station);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left transition-colors hover:border-blue-400/40 hover:bg-blue-500/10"
                >
                  <span className="min-w-0 truncate text-sm font-medium text-white">
                    {station.name}
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-300">
                    <Play className="h-3 w-3 fill-current" />
                    Play
                  </span>
                </button>
              ))}
            </div>
          ) : !error ? (
            <p className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
              No stations matched this country and the current stream filters.
            </p>
          ) : null}
          {error && (
            <div
              role="alert"
              className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-200"
            >
              <p>{error}</p>
              <button
                onClick={onRetry}
                className="mt-2 rounded-lg bg-white/10 px-3 py-2 hover:bg-white/20"
              >
                Retry country stations
              </button>
            </div>
          )}
          {!loading && !error && hasMore && (
            <button
              disabled={loadingMore}
              onClick={onLoadMore}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-blue-200 hover:bg-white/10 disabled:opacity-50"
            >
              {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
              {loadingMore ? 'Loading more stations...' : 'Load more stations'}
            </button>
          )}
        </div>
        {boundaryError && (
          <div className="shrink-0 border-t border-white/10 px-4 py-2 text-xs text-amber-300">
            Country outlines may be incomplete because boundary data failed to refresh.
          </div>
        )}
      </div>
    </div>
  );
}
