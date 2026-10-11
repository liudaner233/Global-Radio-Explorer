import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Compass,
  Headphones,
  Loader2,
  Moon,
  Play,
  Shuffle,
  Sunrise,
  Waves,
  Zap,
} from 'lucide-react';
import type { RadioStation } from '../types/radio';
import { getStationIdentity } from '../lib/favorites';
import { getStationGenre, type StationGenre } from '../lib/stationGenres';
import {
  buildSignalJourney,
  getDiscoveryStations,
  getSurpriseStation,
  type DiscoveryMood,
  type DiscoverySolarMode,
} from '../lib/radioDiscovery';
import { cn } from '../lib/utils';
import StationArtwork from './StationArtwork';

interface DiscoveryPanelProps {
  stations: RadioStation[];
  genre: StationGenre;
  selectedStation: RadioStation | null;
  loading?: boolean;
  active?: boolean;
  onSelectStation: (station: RadioStation) => void;
  onStartJourney: (route: RadioStation[]) => void;
}

const moods = [
  { id: 'world', label: 'World', icon: Compass, description: 'Follow a signal somewhere new.' },
  {
    id: 'focus',
    label: 'Focus',
    icon: Headphones,
    description: 'Ambient, instrumental and classical station tags.',
  },
  {
    id: 'unwind',
    label: 'Unwind',
    icon: Waves,
    description: 'Jazz, lounge, acoustic and chill station tags.',
  },
  {
    id: 'energy',
    label: 'Energy',
    icon: Zap,
    description: 'Dance, electronic, rock and funk station tags.',
  },
] as const;

const solarModes = [
  { id: 'any', label: 'Any time', icon: Compass },
  { id: 'sunrise', label: 'Sunrise', icon: Sunrise },
  { id: 'night', label: 'After dark', icon: Moon },
] as const;

export default function DiscoveryPanel({
  stations,
  genre,
  selectedStation,
  loading = false,
  active = true,
  onSelectStation,
  onStartJourney,
}: DiscoveryPanelProps) {
  const [mood, setMood] = useState<DiscoveryMood>('world');
  const [solarMode, setSolarMode] = useState<DiscoverySolarMode>('any');
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60000));
  const [visibleCount, setVisibleCount] = useState(12);
  const surpriseHistory = useRef<string[]>([]);

  useEffect(() => {
    if (!active || solarMode === 'any') return;
    const update = () => {
      if (!document.hidden) setMinute(Math.floor(Date.now() / 60000));
    };
    update();
    const interval = setInterval(update, 60000);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', update);
    };
  }, [active, solarMode]);

  const recommendations = useMemo(
    () => getDiscoveryStations(stations, genre, mood, solarMode, new Date(minute * 60000)),
    [stations, genre, mood, solarMode, minute]
  );
  const candidates = useMemo(() => recommendations.map((item) => item.station), [recommendations]);
  const countryCount = useMemo(
    () =>
      new Set(candidates.map((station) => station.countrycode || station.country).filter(Boolean))
        .size,
    [candidates]
  );
  const selectedId = getStationIdentity(selectedStation);
  const selectedMood = moods.find((item) => item.id === mood)!;

  function surprise() {
    const result = getSurpriseStation(candidates, surpriseHistory.current, selectedStation);
    surpriseHistory.current = result.seenStationIds;
    if (result.station) onSelectStation(result.station);
  }

  function startJourney() {
    const route = buildSignalJourney(candidates, selectedStation);
    if (route.length) onStartJourney(route);
  }

  return (
    <section aria-label="Signal discovery" className="space-y-4 p-2 text-white">
      <div className="px-1 pt-1">
        <p className="text-[9px] font-medium uppercase tracking-[0.2em] text-emerald-200/65">
          A different way to listen
        </p>
        <h3 className="mt-1 text-sm font-semibold">Where will the signal take you?</h3>
      </div>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Listening moods">
        {moods.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={mood === id}
            onClick={() => {
              setMood(id);
              setVisibleCount(12);
            }}
            className={cn(
              'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium transition-colors',
              mood === id
                ? 'border-emerald-300/25 bg-emerald-300/[0.09] text-emerald-100'
                : 'border-white/[0.07] bg-white/[0.025] text-white/55 hover:border-white/20 hover:text-white'
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      <div className="space-y-2 px-1">
        <p className="text-[11px] leading-relaxed text-white/50">{selectedMood.description}</p>
        <div className="flex gap-1" role="group" aria-label="Geographic daylight filter">
          {solarModes.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={solarMode === id}
              onClick={() => {
                setSolarMode(id);
                setVisibleCount(12);
              }}
              className={cn(
                'flex items-center gap-1 rounded-full border px-2 py-1.5 text-[10px] transition-colors',
                solarMode === id
                  ? 'border-cyan-200/20 bg-cyan-200/[0.07] text-cyan-100'
                  : 'border-transparent text-white/45 hover:bg-white/5 hover:text-white/80'
              )}
            >
              <Icon className="h-3 w-3" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
        <p className="text-[10px] leading-relaxed text-white/35">
          {solarMode === 'any'
            ? 'Matched from station tags and listed locations.'
            : 'Daylight follows the real sun at each listed location.'}
        </p>
      </div>
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-white/85">Your next listening route</p>
            <p className="mt-1 text-[10px] text-white/40">
              {candidates.length} signals · {countryCount} countries
            </p>
          </div>
          <Compass className="h-5 w-5 text-emerald-200/55" aria-hidden="true" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={surprise}
            disabled={!candidates.length}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 py-2 text-[11px] font-medium text-white/75 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />
            Surprise me
          </button>
          <button
            type="button"
            onClick={startJourney}
            disabled={!candidates.length}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-200/15 py-2 text-[11px] font-medium text-emerald-100 transition-colors hover:bg-emerald-200/20 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            Start journey
          </button>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-white/35">
          Up to six real stations, with a new country at each stop when possible.
        </p>
      </div>
      {loading && !recommendations.length ? (
        <div
          className="flex items-center justify-center gap-2 py-8 text-xs text-white/45"
          role="status"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          Finding live signals...
        </div>
      ) : !recommendations.length ? (
        <div className="space-y-3 rounded-xl border border-white/[0.06] px-4 py-5 text-center">
          <p className="text-xs leading-relaxed text-white/55">
            No loaded signals match these filters. Try World, Any time, or the All category.
          </p>
          <button
            type="button"
            onClick={() => {
              setMood('world');
              setSolarMode('any');
            }}
            className="text-xs font-medium text-emerald-200 hover:text-emerald-100"
          >
            Reset discovery filters
          </button>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="flex items-center justify-between px-1 text-[10px] text-white/40">
            <span>Signals to explore</span>
            <span>{getStationGenre(genre).label}</span>
          </div>
          {recommendations.slice(0, visibleCount).map(({ station, reason }) => (
            <button
              type="button"
              key={getStationIdentity(station)}
              onClick={() => onSelectStation(station)}
              aria-label={`Play ${station.name}`}
              aria-pressed={selectedId === getStationIdentity(station)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-xl border p-2 text-left transition-colors',
                selectedId === getStationIdentity(station)
                  ? 'border-emerald-200/20 bg-emerald-200/[0.07]'
                  : 'border-transparent hover:border-white/[0.06] hover:bg-white/[0.035]'
              )}
            >
              <StationArtwork station={station} className="h-9 w-9 shrink-0 rounded-lg" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-white/90">
                  {station.name}
                </span>
                <span className="mt-1 block text-[10px] leading-relaxed text-white/45">
                  {reason}
                </span>
              </span>
              <Play className="h-3.5 w-3.5 shrink-0 text-emerald-200/65" aria-hidden="true" />
            </button>
          ))}
          {visibleCount < recommendations.length && (
            <button
              type="button"
              onClick={() => setVisibleCount((count) => count + 12)}
              className="w-full rounded-lg py-2 text-xs text-white/55 hover:bg-white/5 hover:text-white"
            >
              Show more signals
            </button>
          )}
        </div>
      )}
      <p className="px-1 pb-1 text-[10px] leading-relaxed text-white/30">
        Suggestions use published station metadata, not an analysis of the current broadcast. Stream
        availability may change.
      </p>
    </section>
  );
}
