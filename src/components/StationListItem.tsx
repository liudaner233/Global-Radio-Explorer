import { useState } from 'react';
import { ChevronRight, Globe, Heart, Link2, Radio } from 'lucide-react';
import { cn } from '../lib/utils';
import type { RadioStation } from '../types/radio';
import StationArtwork from './StationArtwork';

const formatStationDistance = (distance: number) =>
  `${distance < 10 ? distance.toFixed(1) : Math.round(distance).toLocaleString('en')} km`;

interface StationListItemProps {
  station: RadioStation;
  selected: boolean;
  favorite: boolean;
  expanded: boolean;
  distance?: number;
  onSelect: () => void;
  onToggleFavorite: () => void;
  onToggleDetails: () => void;
}

const availabilityLabels = {
  available: 'Available',
  unavailable: 'Unavailable',
  unchecked: 'Not checked',
};

export default function StationListItem({
  station,
  selected,
  favorite,
  expanded,
  distance,
  onSelect,
  onToggleFavorite,
  onToggleDetails,
}: StationListItemProps) {
  const [hovered, setHovered] = useState(false);
  const status =
    station.lastcheckok === 1
      ? 'available'
      : station.lastcheckok === 0
        ? 'unavailable'
        : 'unchecked';

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        'relative rounded-xl border transition-colors',
        selected ? 'bg-blue-400/10 border-blue-300/20' : 'hover:bg-white/[0.045] border-transparent'
      )}
    >
      <div className="flex items-center gap-1.5 px-2 py-2.5">
        <button
          onClick={onSelect}
          className="flex-1 min-w-0 flex items-center gap-3 text-left group"
        >
          <StationArtwork station={station} />
          <div className="flex-1 min-w-0">
            <h4
              className={cn(
                'text-[13px] font-medium truncate',
                selected ? 'text-blue-400' : 'text-white'
              )}
            >
              {station.name}
            </h4>
            <div className="mt-1 flex items-center gap-2 text-[10px] text-white/40 uppercase tracking-wide font-medium">
              <span className="flex items-center gap-0.5">
                <Globe className="w-2.5 h-2.5" />
                {station.countrycode}
              </span>
              {distance !== undefined ? (
                <span className="normal-case tracking-normal">
                  {formatStationDistance(distance)}
                </span>
              ) : (
                station.bitrate > 0 && (
                  <span className="flex items-center gap-0.5">
                    <Radio className="w-2.5 h-2.5" />
                    {station.bitrate}k
                  </span>
                )
              )}
            </div>
          </div>
        </button>
        <button
          onClick={onToggleFavorite}
          className={cn(
            'h-8 w-8 shrink-0 rounded-lg border border-transparent transition-colors flex items-center justify-center',
            favorite
              ? 'border-rose-400/40 bg-rose-500/20 text-rose-300'
              : 'text-white/30 hover:bg-white/5 hover:text-white/80'
          )}
          aria-label={favorite ? 'Remove favorite' : 'Add favorite'}
          title={favorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Heart className={cn('w-4 h-4', favorite ? 'fill-current' : '')} />
        </button>
        <button
          onClick={onToggleDetails}
          aria-expanded={expanded}
          className="h-7 w-7 shrink-0 rounded-lg text-white/30 hover:bg-white/5 hover:text-white/80 transition-colors flex items-center justify-center"
          aria-label="Toggle station details"
        >
          <ChevronRight
            className={cn(
              'w-4 h-4 transition-transform duration-200',
              expanded ? 'rotate-90 text-blue-300' : ''
            )}
          />
        </button>
      </div>

      {hovered && (
        <div className="pointer-events-none absolute right-12 bottom-2">
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border backdrop-blur-sm',
              status === 'available' && 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
              status === 'unavailable' && 'bg-amber-500/15 text-amber-200 border-amber-500/30',
              status === 'unchecked' && 'bg-white/10 text-white/70 border-white/20'
            )}
          >
            {availabilityLabels[status]}
          </span>
        </div>
      )}

      <div
        inert={!expanded}
        aria-hidden={!expanded}
        className={cn(
          'grid transition-all duration-200',
          expanded ? 'grid-rows-[1fr] pb-2' : 'grid-rows-[0fr]'
        )}
      >
        <div className="overflow-hidden">
          <div className="mx-2 rounded-xl border border-white/10 bg-black/30 p-3 space-y-2">
            <div className="flex items-start gap-2 text-xs">
              <Link2 className="w-3.5 h-3.5 text-white/40 mt-0.5 shrink-0" />
              {station.homepage ? (
                <a
                  href={station.homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-300 hover:text-blue-200 underline underline-offset-2 break-all"
                >
                  Official Website
                </a>
              ) : (
                <span className="text-white/50">No official website available</span>
              )}
            </div>
            <div className="text-[11px] text-white/60 space-y-1">
              <p className="break-all">
                <span className="text-white/35 mr-2">Stream</span>
                {station.url_resolved || station.url || 'N/A'}
              </p>
              <p>
                <span className="text-white/35 mr-2">Language</span>
                {station.language || 'N/A'}
              </p>
              <p className="break-all">
                <span className="text-white/35 mr-2">Tags</span>
                {station.tags || 'N/A'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
