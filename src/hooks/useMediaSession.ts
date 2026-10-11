import { useEffect, useRef } from 'react';
import type { RadioStation } from '../types/radio';

export function useMediaSession(
  station: RadioStation | null,
  isPlaying: boolean,
  playbackStatus: 'paused' | 'loading' | 'playing' | 'error',
  onTogglePlay: () => void,
  onPreviousStation?: () => void,
  onNextStation?: () => void
) {
  const hasPrevious = Boolean(onPreviousStation);
  const hasNext = Boolean(onNextStation);
  const controls = useRef({ isPlaying, onTogglePlay, onPreviousStation, onNextStation });
  useEffect(() => {
    controls.current = { isPlaying, onTogglePlay, onPreviousStation, onNextStation };
  }, [isPlaying, onTogglePlay, onPreviousStation, onNextStation]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    function setPlaying(playing: boolean) {
      if (controls.current.isPlaying !== playing) controls.current.onTogglePlay();
    }
    const actions = {
      play: () => setPlaying(true),
      pause: () => setPlaying(false),
      stop: () => setPlaying(false),
    };
    const supported: MediaSessionAction[] = [];
    for (const [action, handler] of Object.entries(actions)) {
      try {
        session.setActionHandler(action as MediaSessionAction, handler);
        supported.push(action as MediaSessionAction);
      } catch {
        continue;
      }
    }
    return () => {
      supported.forEach((action) => session.setActionHandler(action, null));
      session.metadata = null;
      session.playbackState = 'none';
    };
  }, []);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    const supported: MediaSessionAction[] = [];
    for (const action of ['previoustrack', 'nexttrack'] as const) {
      const available = action === 'previoustrack' ? hasPrevious : hasNext;
      try {
        session.setActionHandler(
          action,
          available
            ? () => {
                const callback =
                  action === 'previoustrack'
                    ? controls.current.onPreviousStation
                    : controls.current.onNextStation;
                callback?.();
              }
            : null
        );
        supported.push(action);
      } catch {
        continue;
      }
    }
    return () => supported.forEach((action) => session.setActionHandler(action, null));
  }, [hasPrevious, hasNext]);

  useEffect(() => {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    const artwork: MediaImage[] = [];
    try {
      const url = new URL(station?.favicon || '');
      if (url.protocol === 'https:' || url.protocol === 'http:') artwork.push({ src: url.href });
    } catch {
      artwork.length = 0;
    }
    navigator.mediaSession.metadata = station
      ? new MediaMetadata({
          title: station.name,
          artist: [station.country, station.state].filter(Boolean).join(' · '),
          album: 'Global Radio Explorer',
          artwork,
        })
      : null;
  }, [station]);

  useEffect(() => {
    if ('mediaSession' in navigator)
      navigator.mediaSession.playbackState = !station
        ? 'none'
        : playbackStatus === 'playing'
          ? 'playing'
          : 'paused';
  }, [station, playbackStatus]);
}
