import { useLayoutEffect, useRef } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  ExternalLink,
  Globe as GlobeIcon,
  Heart,
  Loader2,
  SkipBack,
  SkipForward,
  RotateCcw,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAudioPlayer, type AudioPlayerOptions } from '../hooks/useAudioPlayer';
import AudioVisualizer from './AudioVisualizer';
import StationArtwork from './StationArtwork';
import { useMediaSession } from '../hooks/useMediaSession';
import { useSleepTimer } from '../hooks/useSleepTimer';
import SleepTimerControl from './SleepTimerControl';
import { useAudioAnalysis } from '../hooks/useAudioAnalysis';

interface PlayerProps extends AudioPlayerOptions {
  onTogglePlay: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  journey?: { index: number; length: number };
  onPreviousStation?: () => void;
  onNextStation?: () => void;
}

export default function Player({
  station,
  isPlaying,
  onTogglePlay,
  isFavorite,
  onToggleFavorite,
  onPlaybackError,
  onPlayingChange,
  onListeningProgress,
  gain = 1,
  journey,
  onPreviousStation,
  onNextStation,
}: PlayerProps) {
  const sleep = useSleepTimer(() => {
    if (onPlayingChange) onPlayingChange(false);
    else if (isPlaying) onTogglePlay();
  });
  const {
    volume,
    setVolume,
    isMuted,
    toggleMute,
    playbackError,
    playbackStatus,
    audioRef,
    audioGeneration,
    retryAudioAnalysis,
    isRetryingAnalysis,
  } = useAudioPlayer({
    station,
    isPlaying,
    onPlaybackError,
    onPlayingChange,
    onListeningProgress,
    gain: gain * sleep.fadeFactor,
  });
  const { analysisRef, modelStatus, analysisStatus, analysisError, description } = useAudioAnalysis(
    audioRef,
    station,
    isPlaying && playbackStatus === 'playing',
    audioGeneration
  );
  const audiblePlaying = isPlaying && playbackStatus === 'playing' && !isMuted && volume > 0;
  const analysisLabel = !isPlaying
    ? 'Paused'
    : isMuted || volume === 0
      ? 'Muted'
      : playbackStatus === 'loading'
        ? 'Connecting to signal'
        : analysisStatus === 'unavailable'
          ? 'Audio analysis unavailable'
          : analysisStatus === 'analyzing'
            ? modelStatus === 'ready' && description
              ? `PE-AV · ${description}`
              : modelStatus === 'loading'
                ? 'Live spectrum · Model loading'
                : 'Live spectrum'
            : 'Waiting for signal';
  useMediaSession(
    station,
    isPlaying,
    playbackStatus,
    onTogglePlay,
    onPreviousStation,
    onNextStation
  );
  const barRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    function updateHeight() {
      document.documentElement.style.setProperty('--player-height', `${bar!.offsetHeight}px`);
    }
    const observer = new ResizeObserver(updateHeight);
    observer.observe(bar);
    updateHeight();
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--player-height');
    };
  }, [station]);
  if (!station) {
    return null;
  }

  return (
    <div
      ref={barRef}
      data-player-bar
      className="pointer-events-auto fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-black/85 p-3 backdrop-blur-xl sm:p-4"
    >
      <div className="mx-auto grid max-w-[1536px] grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(30rem,44rem)_minmax(18rem,1fr)] xl:gap-4">
        <div className="order-1 flex min-w-0 w-full items-center gap-2.5 md:gap-4">
          <StationArtwork
            station={station}
            alt={station.name}
            className="h-10 w-10 md:h-12 md:w-12"
          />
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-medium text-white">{station.name}</h3>
            <p className="flex items-center gap-1 truncate text-xs text-white/50">
              <GlobeIcon className="h-3 w-3" />
              {station.country}
              {station.state ? ` - ${station.state}` : ''}
            </p>
            {journey && (
              <p className="mt-1 truncate text-[10px] text-cyan-200/60">
                Stop {journey.index + 1} / {journey.length} · Signal journey
              </p>
            )}
          </div>
        </div>

        <div className="order-2 min-w-0 w-full sm:order-3 sm:col-span-2 xl:order-2 xl:col-span-1">
          <div
            data-audio-controls
            className="relative flex h-16 w-full items-center justify-center md:h-20"
          >
            <AudioVisualizer
              isPlaying={audiblePlaying}
              analysis={analysisRef}
              gain={
                analysisRef.current.volumeApplied
                  ? 1
                  : isMuted
                    ? 0
                    : volume * gain * sleep.fadeFactor
              }
              hasJourney={Boolean(journey)}
            />
            {journey && (
              <button
                onClick={onPreviousStation}
                disabled={!onPreviousStation}
                aria-label="Previous station"
                className="absolute left-[calc(50%-78px)] z-10 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-zinc-950/80 text-white/65 transition-colors hover:border-white/25 hover:text-white disabled:opacity-20"
              >
                <SkipBack className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={onTogglePlay}
              aria-label={isPlaying ? 'Pause playback' : 'Play station'}
              className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full bg-blue-500 text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-400 active:scale-95 sm:h-14 sm:w-14"
            >
              {playbackStatus === 'loading' && isPlaying ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : isPlaying ? (
                <Pause className="h-6 w-6 fill-current" />
              ) : (
                <Play className="ml-1 h-6 w-6 fill-current" />
              )}
            </button>
            {journey && (
              <button
                onClick={onNextStation}
                disabled={!onNextStation}
                aria-label="Next station"
                className="absolute right-[calc(50%-78px)] z-10 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-zinc-950/80 text-white/65 transition-colors hover:border-white/25 hover:text-white disabled:opacity-20"
              >
                <SkipForward className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex min-h-4 items-center justify-center gap-2">
            <p
              data-audio-description
              title={
                analysisError ||
                description ||
                'Waveform and spectrum follow the audio playing now.'
              }
              className="min-w-0 truncate text-center text-[10px] tracking-wide text-white/35"
            >
              {analysisLabel}
            </p>
            {analysisStatus === 'unavailable' && isPlaying && (
              <button
                type="button"
                aria-label="Retry audio analysis"
                aria-busy={isRetryingAnalysis}
                title="Reconnect this station and retry audio analysis"
                onClick={() => void retryAudioAnalysis()}
                disabled={isRetryingAnalysis}
                className="flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-[10px] text-cyan-200/65 transition-colors hover:bg-white/5 hover:text-cyan-100 focus-visible:outline focus-visible:outline-1 focus-visible:outline-cyan-300 disabled:opacity-40"
              >
                {isRetryingAnalysis ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RotateCcw className="h-3 w-3" />
                )}
                Retry
              </button>
            )}
          </div>
        </div>

        <div className="order-3 flex w-full items-center justify-between gap-2 sm:order-2 sm:w-auto xl:order-3 xl:w-full xl:justify-end">
          <div className="group flex items-center gap-2">
            <button
              onClick={toggleMute}
              aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
              className="text-white/70 transition-colors hover:text-white"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="h-5 w-5" />
              ) : (
                <Volume2 className="h-5 w-5" />
              )}
            </button>
            <input
              type="range"
              aria-label="Volume"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(event) => setVolume(parseFloat(event.target.value))}
              className="h-1 w-20 cursor-pointer appearance-none rounded-lg bg-white/20 accent-blue-500 sm:w-24"
            />
          </div>
          <SleepTimerControl
            deadline={sleep.deadline}
            remainingMs={sleep.remainingMs}
            onSetTimer={sleep.setTimer}
          />
          <button
            onClick={onToggleFavorite}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-full border transition-all',
              isFavorite
                ? 'border-rose-400/40 bg-rose-500/20 text-rose-300 shadow-lg shadow-rose-500/10'
                : 'border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:text-white'
            )}
            aria-label={isFavorite ? 'Remove favorite' : 'Add favorite'}
            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Heart className={cn('h-5 w-5', isFavorite && 'fill-current')} />
          </button>
          <a
            href={station.homepage || station.url_resolved || station.url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 text-white/70 transition-colors hover:text-white"
            title="Visit station website"
          >
            <ExternalLink className="h-5 w-5" />
          </a>
        </div>
      </div>
      {playbackStatus === 'loading' && isPlaying && (
        <p role="status" className="mx-auto mt-3 max-w-[1536px] text-xs text-blue-300">
          Connecting to stream...
        </p>
      )}
      {playbackError && (
        <p className="mx-auto mt-3 max-w-[1536px] text-xs text-amber-300">{playbackError}</p>
      )}
    </div>
  );
}
