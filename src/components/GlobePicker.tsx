import { Play, Plus, Minus, Globe2 } from 'lucide-react';
import type { RadioStation } from '../types/radio';
import { cn } from '../lib/utils';
import type { RefObject } from 'react';
import type { GlobeMethods } from 'react-globe.gl';
import GlobeClock from './GlobeClock';
import { getStationSignalGenre, type StationGenre } from '../lib/stationGenres';

interface GlobePickerProps {
  globeRef: RefObject<GlobeMethods | undefined>;
  station: RadioStation | null;
  genre?: StationGenre;
  moving: boolean;
  hasPlayer: boolean;
  onSelect: (station: RadioStation) => void;
  onZoom: (direction: 'in' | 'out') => void;
  onReset: () => void;
}

export default function GlobePicker({
  globeRef,
  station,
  genre = 'all',
  moving,
  hasPlayer,
  onSelect,
  onZoom,
  onReset,
}: GlobePickerProps) {
  const color = station ? getStationSignalGenre(station, genre).color : undefined;
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      >
        <div
          style={
            color ? { borderColor: `${color}cc`, boxShadow: `0 0 24px ${color}20` } : undefined
          }
          className={cn(
            'flex h-20 w-20 items-center justify-center rounded-full border-2 border-zinc-400/80 shadow-[0_0_0_1px_rgba(0,0,0,0.25)] transition-[border-color,transform,box-shadow] duration-300',
            moving && 'scale-110'
          )}
        >
          <span
            style={color ? { backgroundColor: color } : undefined}
            className="h-1.5 w-1.5 rounded-full bg-white/70 shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
          />
        </div>
      </div>
      <div className="absolute left-1/2 top-[calc(50%+3.25rem)] flex w-64 -translate-x-1/2 flex-col items-center gap-2.5 text-center">
        <GlobeClock globeRef={globeRef} />
        {station ? (
          <button
            onClick={() => onSelect(station)}
            aria-label={`Tune in to ${station.name}`}
            style={{ borderColor: `${color}33`, color }}
            className="pointer-events-auto inline-flex max-w-full items-center gap-2 rounded-xl border bg-zinc-950/90 px-3 py-2 text-sm shadow-lg backdrop-blur-md transition-colors hover:bg-zinc-900/90"
          >
            <Play className="h-3.5 w-3.5 shrink-0 fill-current" />
            <span className="truncate">{station.name}</span>
          </button>
        ) : (
          <p className="rounded-full bg-zinc-950/60 px-3 py-1 text-[11px] text-white/70 backdrop-blur-sm">
            Drag the globe to find a station
          </p>
        )}
      </div>
      <div
        className={cn(
          'pointer-events-auto absolute left-1/2 flex -translate-x-1/2 items-center rounded-full border border-white/10 bg-zinc-950/90 p-1 shadow-lg backdrop-blur-md',
          hasPlayer ? 'bottom-[calc(var(--player-height,88px)+1.5rem)]' : 'bottom-6'
        )}
      >
        <button
          onClick={() => onZoom('out')}
          aria-label="Zoom out map"
          title="Zoom out"
          className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          onClick={onReset}
          aria-label="Reset globe view"
          title="Global view"
          className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white"
        >
          <Globe2 className="h-4 w-4" />
        </button>
        <button
          onClick={() => onZoom('in')}
          aria-label="Zoom in map"
          title="Zoom in"
          className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
