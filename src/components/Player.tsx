import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Volume2, VolumeX, Radio, ExternalLink, Globe as GlobeIcon } from 'lucide-react';
import { RadioStation } from '../types/radio';

interface PlayerProps {
  station: RadioStation | null;
  isPlaying: boolean;
  onTogglePlay: () => void;
}

const Player: React.FC<PlayerProps> = ({ station, isPlaying, onTogglePlay }) => {
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.preload = 'none';
        audioRef.current.crossOrigin = 'anonymous';
      }

      if (station) {
        setPlaybackError(null);
        audioRef.current.src = station.url_resolved || station.url;
        if (isPlaying) {
          audioRef.current.play().catch(err => {
            console.error("Playback failed", err);
            setPlaybackError('该电台流暂时无法播放，请尝试其他电台或点击右侧外链直接打开。');
          });
        }
      } else {
        audioRef.current.pause();
      }
    } catch (err) {
      console.error("Audio setup error:", err);
    }
  }, [station]);

  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        setPlaybackError(null);
        audioRef.current.play().catch(err => {
          console.error("Playback failed", err);
          setPlaybackError('浏览器拦截了自动播放，请再次点击播放按钮。');
        });
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  if (!station) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-xl border-t border-white/10 p-4 z-50">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4 w-full md:w-1/3">
          <div className="w-12 h-12 bg-white/5 rounded-lg flex items-center justify-center overflow-hidden border border-white/10 shrink-0">
            {station.favicon ? (
              <img src={station.favicon} alt={station.name} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
            ) : (
              <Radio className="w-6 h-6 text-blue-400" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="text-white font-medium truncate">{station.name}</h3>
            <p className="text-white/50 text-xs truncate flex items-center gap-1">
              <GlobeIcon className="w-3 h-3" />
              {station.country} {station.state && `• ${station.state}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <button
            onClick={onTogglePlay}
            className="w-12 h-12 rounded-full bg-blue-500 hover:bg-blue-400 text-white flex items-center justify-center transition-all active:scale-95 shadow-lg shadow-blue-500/20"
          >
            {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-1" />}
          </button>
        </div>

        <div className="flex items-center gap-4 w-full md:w-1/3 justify-end">
          <div className="flex items-center gap-2 group">
            <button onClick={() => setIsMuted(!isMuted)} className="text-white/70 hover:text-white transition-colors">
              {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-24 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>
          <a
            href={station.homepage || station.url_resolved || station.url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 text-white/70 hover:text-white transition-colors"
            title="Visit Homepage"
          >
            <ExternalLink className="w-5 h-5" />
          </a>
        </div>
      </div>
      {playbackError && (
        <p className="max-w-7xl mx-auto mt-3 text-xs text-amber-300">
          {playbackError}
        </p>
      )}
    </div>
  );
};

export default Player;
