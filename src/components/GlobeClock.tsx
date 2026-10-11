import { Moon, Sun, Sunrise, Sunset } from 'lucide-react';
import type { RefObject } from 'react';
import type { GlobeMethods } from 'react-globe.gl';
import { useGlobeClock } from '../hooks/useGlobeClock';

export default function GlobeClock({
  globeRef,
}: {
  globeRef: RefObject<GlobeMethods | undefined>;
}) {
  const clock = useGlobeClock(globeRef);
  const Icon =
    clock.phase === 'Nighttime'
      ? Moon
      : clock.phase === 'Sunrise'
        ? Sunrise
        : clock.phase === 'Sunset'
          ? Sunset
          : Sun;
  return (
    <div
      data-globe-clock
      data-timezone={clock.timezone}
      title={`Local time · ${clock.timezone.replaceAll('_', ' ')}`}
      className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-[#10141b]/85 px-3 py-2 text-xs shadow-lg backdrop-blur-xl"
    >
      <Icon
        className={`h-3.5 w-3.5 ${clock.phase === 'Nighttime' ? 'text-indigo-300' : 'text-amber-300'}`}
      />
      <time dateTime={clock.iso} className="font-medium tabular-nums text-white/90">
        {clock.time || '··:··:··'}
      </time>
      <span className="text-white/25">·</span>
      <span className="text-white/55">{clock.phase}</span>
    </div>
  );
}
