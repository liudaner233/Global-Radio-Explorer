import { useState } from 'react';
import { BookOpen, Clock3, Globe2, Play, Trash2, X } from 'lucide-react';
import type { RadioStation } from '../types/radio';
import { formatListeningDuration, type ListeningPassportData } from '../lib/listeningPassport';
import StationArtwork from './StationArtwork';

interface ListeningPassportProps {
  passport: ListeningPassportData;
  onSelectStation: (station: RadioStation) => void;
  onClear: () => void;
}

const listenedOn = (time: number) =>
  new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(time);

export default function ListeningPassport({
  passport,
  onSelectStation,
  onClear,
}: ListeningPassportProps) {
  const [confirmClear, setConfirmClear] = useState(false);
  return (
    <section
      aria-label="Listening passport"
      className="radio-panel flex h-full w-[min(17.5rem,calc(100vw-5rem))] flex-col overflow-hidden rounded-3xl"
    >
      <div className="border-b border-white/[0.06] px-4 pb-4 pt-5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-emerald-300/15 bg-emerald-300/[0.06]">
            <BookOpen className="h-4 w-4 text-emerald-200/80" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-white/90">
              Listening Passport
            </h2>
            <p className="mt-1 text-[9px] font-medium uppercase tracking-[0.18em] text-white/35">
              Your journey through sound
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5">
            <span className="flex items-center gap-1.5 text-[10px] text-white/40">
              <Clock3 className="h-3 w-3" /> Listening time
            </span>
            <p className="mt-1.5 text-lg font-medium tabular-nums tracking-tight text-white/85">
              {formatListeningDuration(passport.totalSeconds)}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-300/[0.08] bg-emerald-300/[0.025] px-3 py-2.5">
            <span className="flex items-center gap-1.5 text-[10px] text-white/40">
              <Globe2 className="h-3 w-3" /> Countries
            </span>
            <p className="mt-1.5 text-lg font-medium tabular-nums tracking-tight text-emerald-200/85">
              {passport.countries.length}
            </p>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        {passport.recent.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-4 py-8 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-emerald-300/[0.08] bg-emerald-300/[0.025]">
              <Globe2 className="h-6 w-6 text-emerald-200/35" />
            </div>
            <p className="text-sm font-medium text-white/65">Your first destination awaits</p>
            <p className="mt-2 text-xs leading-relaxed text-white/35">
              Listen to a station to start your passport. Only audio you actually hear counts.
            </p>
          </div>
        ) : (
          <>
            {passport.countries.length > 0 && (
              <div className="mb-5">
                <h3 className="mb-2.5 px-1 text-[10px] font-medium uppercase tracking-[0.15em] text-white/35">
                  Places heard
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {passport.countries.map((country) => (
                    <span
                      key={country.id}
                      title={`${country.name} · ${formatListeningDuration(country.seconds)} · ${listenedOn(country.lastListenedAt)}`}
                      className="max-w-full truncate rounded-lg border border-emerald-300/10 bg-emerald-300/[0.035] px-2.5 py-1.5 text-[11px] text-emerald-100/70"
                    >
                      {country.code && (
                        <span className="mr-1.5 font-semibold text-emerald-200/80">
                          {country.code}
                        </span>
                      )}
                      {country.name !== country.code && country.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <h3 className="mb-2 px-1 text-[10px] font-medium uppercase tracking-[0.15em] text-white/35">
              Recently heard
            </h3>
            <div className="space-y-1">
              {passport.recent.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => onSelectStation(entry.station)}
                  aria-label={`Replay ${entry.station.name}`}
                  className="group flex w-full items-center gap-2.5 rounded-xl border border-transparent p-2 text-left transition-colors hover:border-emerald-300/10 hover:bg-white/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/40"
                >
                  <StationArtwork station={entry.station} className="h-9 w-9 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium text-white/85">
                      {entry.station.name}
                    </span>
                    <span className="mt-1 flex items-center gap-1.5 text-[10px] text-white/35">
                      <span className="truncate">
                        {entry.station.countrycode || entry.station.country || 'Radio'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="shrink-0 tabular-nums">
                        {formatListeningDuration(entry.seconds)}
                      </span>
                    </span>
                  </span>
                  <Play className="h-3.5 w-3.5 shrink-0 text-white/25 transition-colors group-hover:text-emerald-200/80" />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="border-t border-white/[0.06] px-4 py-3">
        {confirmClear ? (
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => {
                onClear();
                setConfirmClear(false);
              }}
              className="rounded-lg bg-rose-300/10 px-2.5 py-1.5 text-[11px] text-rose-200 hover:bg-rose-300/15"
            >
              Clear listening history
            </button>
            <button
              aria-label="Cancel clearing passport"
              onClick={() => setConfirmClear(false)}
              className="rounded-lg p-1.5 text-white/45 hover:bg-white/5 hover:text-white/75"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] text-white/30">Private · Saved on this device</p>
            {passport.recent.length > 0 && (
              <button
                aria-label="Clear passport"
                title="Clear passport"
                onClick={() => setConfirmClear(true)}
                className="rounded-lg p-1.5 text-white/30 hover:bg-rose-300/10 hover:text-rose-200/80"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
