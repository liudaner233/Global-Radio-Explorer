import { useEffect, useRef, useState } from 'react';
import { getStationIdentity } from '../lib/favorites';
import { readAudioPreferences, saveAudioPreferences } from '../lib/audioPreferences';
import type { RadioStation } from '../types/radio';
import { getAudioPlaybackSource, probeAudioGateway } from '../lib/audioGateway';

export interface AudioPlayerOptions {
  station: RadioStation | null;
  isPlaying: boolean;
  onPlaybackError?: (message: string | null) => void;
  onPlayingChange?: (playing: boolean) => void;
  onListeningProgress?: (station: RadioStation, seconds: number) => void;
  gain?: number;
}

const BLOCKED_AUTOPLAY_MESSAGE =
  'Autoplay was blocked by your browser. Click the play button again to continue.';
const STREAM_UNAVAILABLE_MESSAGE =
  'This stream is currently unavailable. Please try another station or open the station website.';

const getPlaybackErrorMessage = (error: unknown) => {
  if (
    error instanceof Error &&
    (error.name === 'NotAllowedError' || error.message.toLowerCase().includes('autoplay'))
  ) {
    return BLOCKED_AUTOPLAY_MESSAGE;
  }

  return STREAM_UNAVAILABLE_MESSAGE;
};

export function useAudioPlayer({
  station,
  isPlaying,
  onPlaybackError,
  onPlayingChange,
  onListeningProgress,
  gain = 1,
}: AudioPlayerOptions) {
  const [preferences] = useState(readAudioPreferences);
  const [volume, setVolume] = useState(preferences.volume);
  const [isMuted, setIsMuted] = useState(preferences.muted);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [playbackStatus, setPlaybackStatus] = useState<'paused' | 'loading' | 'playing' | 'error'>(
    'paused'
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioGeneration, setAudioGeneration] = useState(0);
  const directSourceRef = useRef<{ key: string; expiresAt: number; cors: boolean } | null>(null);
  const retryPendingRef = useRef(false);
  const [isRetryingAnalysis, setIsRetryingAnalysis] = useState(false);
  const [playedAudio] = useState(() => new WeakSet<HTMLAudioElement>());
  const callbacksRef = useRef({ onPlaybackError, onPlayingChange, onListeningProgress, station });
  const streamUrl = station?.url_resolved || station?.url || '';
  const stationIdentity = getStationIdentity(station);

  useEffect(() => {
    callbacksRef.current = { onPlaybackError, onPlayingChange, onListeningProgress, station };
  }, [onPlaybackError, onPlayingChange, onListeningProgress, station]);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'none';
    if (streamUrl) {
      const fallback =
        directSourceRef.current?.key === `${stationIdentity}|${streamUrl}` &&
        directSourceRef.current.expiresAt > Date.now()
          ? directSourceRef.current
          : null;
      const source = fallback ? streamUrl : getAudioPlaybackSource(callbacksRef.current.station);
      try {
        if (
          new URL(source, window.location.href).origin !== window.location.origin &&
          fallback?.cors !== false
        )
          audio.crossOrigin = 'anonymous';
      } catch {
        audio.crossOrigin = null;
      }
      audio.src = source;
    }
    audioRef.current = audio;
    setPlaybackError(null);
    setPlaybackStatus('paused');
    callbacksRef.current.onPlaybackError?.(null);

    return () => {
      audioRef.current = null;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    };
  }, [streamUrl, stationIdentity, audioGeneration]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted
        ? 0
        : volume * Math.max(0, Math.min(1, Number.isFinite(gain) ? gain : 1));
    }
  }, [volume, isMuted, gain, streamUrl, stationIdentity, audioGeneration]);

  useEffect(() => {
    saveAudioPreferences(volume, isMuted);
  }, [volume, isMuted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (
      isPlaying &&
      directSourceRef.current?.key === `${stationIdentity}|${streamUrl}` &&
      directSourceRef.current.expiresAt <= Date.now() &&
      !audio.src.includes('/api/audio/stream/') &&
      getAudioPlaybackSource(callbacksRef.current.station).startsWith('/api/audio/stream/')
    ) {
      directSourceRef.current = null;
      setAudioGeneration((current) => current + 1);
      return;
    }
    let active = true;
    let failed = false;
    let counting = false;
    let recovering = false;
    let usingProxy = audio.src.includes('/api/audio/stream/');
    let startupTimer = 0;
    let audible = audio.volume > 0;
    let position = audio.currentTime;
    const isCurrentAttempt = () => active && audioRef.current === audio;
    const recordProgress = () => {
      const elapsed = audio.currentTime - position;
      position = audio.currentTime;
      if (
        !isCurrentAttempt() ||
        failed ||
        !counting ||
        audio.seeking ||
        !audible ||
        !Number.isFinite(elapsed) ||
        elapsed <= 0 ||
        elapsed > 30
      )
        return;
      const current = callbacksRef.current;
      if (current.station) current.onListeningProgress?.(current.station, elapsed);
    };
    const handleTimeUpdate = () => {
      if (!audio.paused) recordProgress();
    };
    const handleSeek = () => {
      position = audio.currentTime;
    };
    const handleVolumeChange = () => {
      recordProgress();
      audible = audio.volume > 0;
    };
    const handleFailure = (message: string) => {
      if (!isCurrentAttempt() || failed || recovering) return;
      if (
        (usingProxy || audio.crossOrigin === 'anonymous') &&
        message === STREAM_UNAVAILABLE_MESSAGE &&
        isPlaying
      ) {
        const cors = usingProxy;
        usingProxy = false;
        recovering = true;
        clearTimeout(startupTimer);
        recordProgress();
        counting = false;
        setPlaybackStatus('loading');
        directSourceRef.current = {
          key: `${stationIdentity}|${streamUrl}`,
          expiresAt: Date.now() + 30000,
          cors,
        };
        setAudioGeneration((current) => current + 1);
        return;
      }
      recordProgress();
      counting = false;
      failed = true;
      setPlaybackError(message);
      setPlaybackStatus('error');
      audio.pause();
      callbacksRef.current.onPlaybackError?.(message);
      callbacksRef.current.onPlayingChange?.(false);
    };
    const handlePlaying = () => {
      if (isCurrentAttempt() && !failed && !recovering && isPlaying) {
        recovering = false;
        clearTimeout(startupTimer);
        if (!counting) position = audio.currentTime;
        counting = true;
        setPlaybackStatus('playing');
      }
    };
    const handleWaiting = () => {
      if (isCurrentAttempt() && !failed && isPlaying) {
        recordProgress();
        counting = false;
        setPlaybackStatus('loading');
      }
    };
    const handleStopped = () => {
      if (!isCurrentAttempt() || failed || recovering) return;
      recordProgress();
      counting = false;
      setPlaybackStatus('paused');
      if (isPlaying) callbacksRef.current.onPlayingChange?.(false);
    };
    const handlePause = () => {
      if (audio.paused) handleStopped();
    };
    const handleAudioError = () => handleFailure(STREAM_UNAVAILABLE_MESSAGE);
    audio.addEventListener('error', handleAudioError);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('stalled', handleWaiting);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleStopped);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('seeking', handleSeek);
    audio.addEventListener('seeked', handleSeek);
    audio.addEventListener('volumechange', handleVolumeChange);

    if (isPlaying) {
      setPlaybackError(null);
      callbacksRef.current.onPlaybackError?.(null);
      setPlaybackStatus('loading');
      if (!streamUrl) {
        handleFailure(STREAM_UNAVAILABLE_MESSAGE);
      } else {
        try {
          if (audio.error) audio.load();
          if (usingProxy || audio.crossOrigin === 'anonymous')
            startupTimer = window.setTimeout(
              () => handleFailure(STREAM_UNAVAILABLE_MESSAGE),
              usingProxy ? 22000 : 10000
            );
          void audio
            .play()
            .then(handlePlaying)
            .catch((error) => {
              handleFailure(getPlaybackErrorMessage(error));
            });
        } catch (error) {
          handleFailure(getPlaybackErrorMessage(error));
        }
        playedAudio.add(audio);
      }
    } else {
      audio.pause();
      setPlaybackStatus((status) => (status === 'error' ? status : 'paused'));
      if (usingProxy && playedAudio.has(audio)) {
        playedAudio.delete(audio);
        audio.removeAttribute('src');
        audio.load();
        setAudioGeneration((current) => current + 1);
      }
    }

    return () => {
      recordProgress();
      clearTimeout(startupTimer);
      active = false;
      audio.removeEventListener('error', handleAudioError);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('stalled', handleWaiting);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleStopped);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('seeking', handleSeek);
      audio.removeEventListener('seeked', handleSeek);
      audio.removeEventListener('volumechange', handleVolumeChange);
      audio.pause();
    };
  }, [isPlaying, streamUrl, stationIdentity, audioGeneration, playedAudio]);

  const retryAudioAnalysis = async () => {
    if (retryPendingRef.current || !streamUrl) return;
    retryPendingRef.current = true;
    setIsRetryingAnalysis(true);
    const audio = audioRef.current;
    try {
      const gateway = await probeAudioGateway({ force: true });
      if (!gateway && !import.meta.env.DEV) return;
      if (!audio || audioRef.current !== audio) return;
      directSourceRef.current = null;
      setAudioGeneration((current) => current + 1);
    } finally {
      retryPendingRef.current = false;
      setIsRetryingAnalysis(false);
    }
  };

  return {
    audioRef,
    audioGeneration,
    volume,
    setVolume,
    isMuted,
    toggleMute: () => setIsMuted((current) => !current),
    playbackError,
    playbackStatus,
    retryAudioAnalysis,
    isRetryingAnalysis,
  };
}
