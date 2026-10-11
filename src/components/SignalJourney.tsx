import { Route, X } from 'lucide-react';
import type { RadioStation } from '../types/radio';
import { cn } from '../lib/utils';

interface SignalJourneyProps {
  route: RadioStation[];
  index: number;
  onGoTo: (index: number) => void;
  onEnd: () => void;
}

export default function SignalJourney({ route, index, onGoTo, onEnd }: SignalJourneyProps) {
  if (!route.length) return null;
  return (
    <section
      aria-label="Current signal journey"
      className="mb-3 rounded-xl border border-cyan-200/15 bg-cyan-300/[0.035] p-3"
    >
      <div className="mb-2 flex items-center gap-2 text-[11px] text-cyan-100/80">
        <Route className="h-3.5 w-3.5" />
        <span className="font-medium">Signal journey</span>
        <span className="ml-auto tabular-nums text-white/40">
          {index + 1} / {route.length}
        </span>
        <button
          onClick={onEnd}
          aria-label="End signal journey"
          title="Keep listening and end the route"
          className="rounded-md p-1 text-white/40 hover:bg-white/5 hover:text-white"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <ol className="grid grid-cols-3 gap-1.5">
        {route.map((station, stop) => (
          <li key={station.stationuuid || station.url_resolved || station.url}>
            <button
              onClick={() => onGoTo(stop)}
              aria-label={`Go to journey stop ${stop + 1}: ${station.name}`}
              aria-current={stop === index ? 'step' : undefined}
              title={`${station.country} · ${station.name}`}
              className={cn(
                'w-full truncate rounded-lg border px-2 py-1.5 text-left text-[10px] transition-colors',
                stop === index
                  ? 'border-cyan-200/30 bg-cyan-200/10 text-cyan-100'
                  : 'border-white/[0.06] text-white/50 hover:bg-white/5 hover:text-white'
              )}
            >
              <span className="mr-1.5 text-white/30">{stop + 1}</span>
              {station.countrycode || station.country || 'World'}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
