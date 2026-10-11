import { act, cleanup, renderHook } from '@testing-library/react';
import { getAudioPlaybackSource, probeAudioGateway } from '../lib/audioGateway';
import { createStation } from '../test/fixtures';
import { useAudioPlayer } from './useAudioPlayer';

vi.mock('../lib/audioGateway', () => ({
  getAudioPlaybackSource: vi.fn(),
  probeAudioGateway: vi.fn(),
}));

class TransportAudio extends EventTarget {
  static instances: TransportAudio[] = [];
  src = '';
  preload = '';
  volume = 1;
  paused = true;
  currentTime = 0;
  seeking = false;
  error = null;
  play = vi.fn(() => {
    this.paused = false;
    return Promise.resolve();
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
  removeAttribute = vi.fn();
  load = vi.fn();
  constructor() {
    super();
    TransportAudio.instances.push(this);
  }
}

describe('safe audio proxy fallback', () => {
  beforeEach(() => {
    localStorage.clear();
    TransportAudio.instances = [];
    vi.stubGlobal('Audio', TransportAudio as unknown as typeof Audio);
    vi.mocked(getAudioPlaybackSource).mockReturnValue('/api/audio/stream/registered-station');
    vi.mocked(probeAudioGateway).mockResolvedValue({
      protocol: 'radio-audio',
      version: 1,
      proxy: true,
    });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('creates a fresh native audio for direct fallback without stopping the parent play intent', async () => {
    const station = createStation();
    const onPlayingChange = vi.fn();
    const { result } = renderHook(() =>
      useAudioPlayer({ station, isPlaying: true, onPlayingChange })
    );
    await act(async () => {
      await Promise.resolve();
    });
    const proxyAudio = TransportAudio.instances[0];
    act(() => proxyAudio.dispatchEvent(new Event('error')));
    await act(async () => {
      await Promise.resolve();
    });
    expect(TransportAudio.instances).toHaveLength(2);
    const nativeAudio = TransportAudio.instances[1];
    expect(nativeAudio.src).toBe(station.url_resolved);
    expect(proxyAudio.pause).toHaveBeenCalled();
    expect(result.current.audioRef.current).toBe(nativeAudio);
    expect(result.current.playbackStatus).toBe('playing');
    expect(result.current.playbackError).toBeNull();
    expect(onPlayingChange).not.toHaveBeenCalled();
    act(() => proxyAudio.dispatchEvent(new Event('ended')));
    expect(onPlayingChange).not.toHaveBeenCalled();
  });

  it('reports a native playback failure instead of repeatedly retrying the proxy', async () => {
    const onPlayingChange = vi.fn();
    const { result } = renderHook(() =>
      useAudioPlayer({ station: createStation(), isPlaying: true, onPlayingChange })
    );
    act(() => TransportAudio.instances[0].dispatchEvent(new Event('error')));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => TransportAudio.instances[1].dispatchEvent(new Event('error')));
    expect(TransportAudio.instances).toHaveLength(2);
    expect(result.current.playbackStatus).toBe('error');
    expect(onPlayingChange).toHaveBeenCalledWith(false);
  });

  it('reconnects a direct fallback through the gateway when analysis is explicitly retried', async () => {
    const onPlayingChange = vi.fn();
    const station = createStation();
    const { result } = renderHook(() =>
      useAudioPlayer({ station, isPlaying: true, onPlayingChange })
    );
    act(() => TransportAudio.instances[0].dispatchEvent(new Event('error')));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.audioRef.current?.src).toBe(station.url_resolved);
    const fallback = TransportAudio.instances[1];
    await act(async () => result.current.retryAudioAnalysis());
    await act(async () => {
      await Promise.resolve();
    });
    expect(probeAudioGateway).toHaveBeenCalledWith({ force: true });
    expect(TransportAudio.instances).toHaveLength(3);
    expect(result.current.audioRef.current?.src).toBe('/api/audio/stream/registered-station');
    expect(fallback.pause).toHaveBeenCalled();
    expect(result.current.playbackStatus).toBe('playing');
    expect(onPlayingChange).not.toHaveBeenCalled();
  });

  it('lets a slow but working proxy finish connecting before reverting to unanalysable audio', async () => {
    vi.useFakeTimers();
    try {
      renderHook(() => useAudioPlayer({ station: createStation(), isPlaying: true }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(TransportAudio.instances).toHaveLength(1);
      expect(TransportAudio.instances[0].src).toBe('/api/audio/stream/registered-station');
    } finally {
      cleanup();
      vi.useRealTimers();
    }
  });

  it('retries the proxy on later playback after a temporary direct fallback expires', async () => {
    vi.useFakeTimers();
    try {
      const station = createStation();
      const { result, rerender } = renderHook(
        ({ playing }) => useAudioPlayer({ station, isPlaying: playing }),
        { initialProps: { playing: true } }
      );
      act(() => TransportAudio.instances[0].dispatchEvent(new Event('error')));
      await act(async () => {
        await Promise.resolve();
      });
      expect(result.current.audioRef.current?.src).toBe(station.url_resolved);
      rerender({ playing: false });
      await act(async () => vi.advanceTimersByTimeAsync(30001));
      rerender({ playing: true });
      await act(async () => {
        await Promise.resolve();
      });
      expect(TransportAudio.instances).toHaveLength(3);
      expect(result.current.audioRef.current?.src).toBe('/api/audio/stream/registered-station');
      expect(result.current.playbackStatus).toBe('playing');
    } finally {
      cleanup();
      vi.useRealTimers();
    }
  });
});
