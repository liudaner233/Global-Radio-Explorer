import { useState } from 'react';
import type { RadioStation } from '../types/radio';
import { cn } from '../lib/utils';

interface StationArtworkProps {
  station: RadioStation;
  className?: string;
  alt?: string;
}

export default function StationArtwork({ station, className, alt = '' }: StationArtworkProps) {
  const [failed, setFailed] = useState('');
  const [loaded, setLoaded] = useState('');
  const src = station.favicon;
  const showImage = !!src && src !== failed;
  const ready = showImage && loaded === src;
  const initials = station.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
  return (
    <div
      className={cn(
        'station-artwork relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10',
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute text-xs font-semibold tracking-wide text-blue-200/80 transition-opacity duration-200',
          ready ? 'opacity-0' : 'opacity-100'
        )}
      >
        {initials || 'FM'}
      </span>
      {showImage && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(src)}
          onError={() => setFailed(src)}
          className={cn(
            'relative h-full w-full object-contain transition-opacity duration-200',
            ready ? 'opacity-100' : 'opacity-0'
          )}
        />
      )}
    </div>
  );
}
