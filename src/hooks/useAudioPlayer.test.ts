import { act, cleanup, renderHook } from '@testing-library/react';
import { createStation } from '../test/fixtures';
import { useAudioPlayer, type AudioPlayerOptions } from './useAudioPlayer';

class MockAudio extends EventTarget {
  static instances: MockAudio[] = [];
  src = '';
  preload = '';
  volume = 1;
  paused = true;
  seeking = false;
  currentTime = 0;
  error = null;
  play = vi.fn(() => {
    this.paused = false;
    return new Promise<void>(() => undefined);
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
  removeAttribute = vi.fn();
  load = vi.fn();

  constructor() {
    super();
    MockAudio.instances.push(this);
  }
}

function emit(audio: MockAudio, event: string, currentTime = audio.currentTime) {
  act(() => {
    audio.currentTime = currentTime;
    audio.dispatchEvent(new Event(event));
  });
}

function totalListening(onProgress: ReturnType<typeof vi.fn>) {
  return onProgress.mock.calls.reduce((total, [, seconds]) => total + seconds, 0);
}

describe('audio listening progress and gain', () => {
  beforeEach(() => {
    localStorage.clear();
    MockAudio.instances = [];
    vi.stubGlobal('Audio', MockAudio as unknown as typeof Audio);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('counts media progress only after playback starts and never counts duplicate updates', () => {
    const station = createStation();
    const onListeningProgress = vi.fn();
    const { result } = renderHook(() =>
      useAudioPlayer({ station, isPlaying: true, onListeningProgress })
    );
    const audio = MockAudio.instances[0];
    emit(audio, 'timeupdate', 2);
    expect(onListeningProgress).not.toHaveBeenCalled();
    expect(result.current.playbackStatus).toBe('loading');
    emit(audio, 'playing');
    emit(audio, 'timeupdate', 2.75);
    emit(audio, 'timeupdate', 3.5);
    emit(audio, 'timeupdate', 3.5);
    expect(onListeningProgress).toHaveBeenCalledTimes(2);
    expect(onListeningProgress).toHaveBeenNthCalledWith(1, station, 0.75);
    expect(totalListening(onListeningProgress)).toBe(1.5);
  });

  it('does not count time updates while paused and resumes from a fresh baseline', () => {
    const station = createStation();
    const onListeningProgress = vi.fn();
    const { rerender } = renderHook((options: AudioPlayerOptions) => useAudioPlayer(options), {
      initialProps: { station, isPlaying: true, onListeningProgress },
    });
    const audio = MockAudio.instances[0];
    emit(audio, 'playing');
    emit(audio, 'timeupdate', 1);
    rerender({ station, isPlaying: false, onListeningProgress });
    emit(audio, 'timeupdate', 20);
    expect(totalListening(onListeningProgress)).toBe(1);
    rerender({ station, isPlaying: true, onListeningProgress });
    emit(audio, 'playing');
    emit(audio, 'timeupdate', 21);
    expect(totalListening(onListeningProgress)).toBe(2);
    expect(MockAudio.instances).toHaveLength(1);
  });

  it.each(['waiting', 'stalled'])('excludes buffered time after the %s event', (event) => {
    const onListeningProgress = vi.fn();
    const { result } = renderHook(() =>
      useAudioPlayer({ station: createStation(), isPlaying: true, onListeningProgress })
    );
    const audio = MockAudio.instances[0];
    emit(audio, 'playing');
    emit(audio, 'timeupdate', 1);
    emit(audio, event, 1.5);
    expect(totalListening(onListeningProgress)).toBe(1.5);
    expect(result.current.playbackStatus).toBe('loading');
    emit(audio, 'timeupdate', 15);
    emit(audio, 'playing', 20);
    emit(audio, 'timeupdate', 21);
    expect(totalListening(onListeningProgress)).toBe(2.5);
  });

  it('excludes muted and zero-volume time while keeping playback active', () => {
    const onListeningProgress = vi.fn();
    const { result } = renderHook(() =>
      useAudioPlayer({ station: createStation(), isPlaying: true, onListeningProgress })
    );
    const audio = MockAudio.instances[0];
    emit(audio, 'playing');
    emit(audio, 'timeupdate', 1);
    act(() => result.current.toggleMute());
    expect(audio.volume).toBe(0);
    emit(audio, 'volumechange');
    emit(audio, 'timeupdate', 10);
    act(() => result.current.toggleMute());
    emit(audio, 'volumechange');
    emit(audio, 'timeupdate', 11);
    act(() => result.current.setVolume(0));
    emit(audio, 'volumechange');
    emit(audio, 'timeupdate', 20);
    act(() => result.current.setVolume(0.5));
    emit(audio, 'volumechange');
    emit(audio, 'timeupdate', 21);
    expect(totalListening(onListeningProgress)).toBe(3);
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it.each(['mute', 'volume', 'gain'])(
    'excludes unsampled silent time caused by %s when media updates were throttled',
    (method) => {
      const onListeningProgress = vi.fn();
      const options = {
        station: createStation(),
        isPlaying: true,
        onListeningProgress,
        gain: 1,
      };
      const { result, rerender } = renderHook(
        (props: AudioPlayerOptions) => useAudioPlayer(props),
        { initialProps: options }
      );
      const audio = MockAudio.instances[0];
      emit(audio, 'playing');
      emit(audio, 'timeupdate', 1);
      if (method === 'mute') act(() => result.current.toggleMute());
      if (method === 'volume') act(() => result.current.setVolume(0));
      if (method === 'gain') rerender({ ...options, gain: 0 });
      emit(audio, 'volumechange');
      audio.currentTime = 5;
      if (method === 'mute') act(() => result.current.toggleMute());
      if (method === 'volume') act(() => result.current.setVolume(0.8));
      if (method === 'gain') rerender({ ...options, gain: 1 });
      emit(audio, 'volumechange');
      emit(audio, 'timeupdate', 5.5);
      expect(totalListening(onListeningProgress)).toBe(1.5);
    }
  );

  it('retains audible progress when a nonzero fade gain changes between samples', () => {
    const onListeningProgress = vi.fn();
    const options = {
      station: createStation(),
      isPlaying: true,
      onListeningProgress,
      gain: 1,
    };
    const { rerender } = renderHook((props: AudioPlayerOptions) => useAudioPlayer(props), {
      initialProps: options,
    });
    const audio = MockAudio.instances[0];
    emit(audio, 'playing');
    audio.currentTime = 0.5;
    rerender({ ...options, gain: 0.5 });
    emit(audio, 'volumechange');
    emit(audio, 'timeupdate', 1);
    expect(totalListening(onListeningProgress)).toBe(1);
  });

  it('ignores seeks even when no time update occurs between seeking and seeked', () => {
    const onListeningProgress = vi.fn();
    renderHook(() =>
      useAudioPlayer({ station: createStation(), isPlaying: true, onListeningProgress })
    );
    const audio = MockAudio.instances[0];
    emit(audio, 'playing');
    emit(audio, 'timeupdate', 1);
    audio.seeking = true;
    emit(audio, 'seeking', 10);
    audio.seeking = false;
    emit(audio, 'seeked');
    emit(audio, 'timeupdate', 10.5);
    expect(totalListening(onListeningProgress)).toBe(1.5);
  });

  it('rejects large discontinuities and resumes counting actual progress afterward', () => {
    const onListeningProgress = vi.fn();
    renderHook(() =>
      useAudioPlayer({ station: createStation(), isPlaying: true, onListeningProgress })
    );
    const audio = MockAudio.instances[0];
    emit(audio, 'playing');
    emit(audio, 'timeupdate', 1);
    emit(audio, 'timeupdate', 200);
    emit(audio, 'timeupdate', 200.5);
    expect(totalListening(onListeningProgress)).toBe(1.5);
  });

  it('ignores old source events after a switch and records the current station', () => {
    const first = createStation();
    const second = createStation({
      stationuuid: 'second',
      name: 'Second FM',
      url_resolved: 'https://example.com/second',
    });
    const onListeningProgress = vi.fn();
    const { rerender } = renderHook((options: AudioPlayerOptions) => useAudioPlayer(options), {
      initialProps: { station: first, isPlaying: true, onListeningProgress },
    });
    const oldAudio = MockAudio.instances[0];
    emit(oldAudio, 'playing');
    emit(oldAudio, 'timeupdate', 1);
    rerender({ station: second, isPlaying: true, onListeningProgress });
    const currentAudio = MockAudio.instances[1];
    oldAudio.paused = false;
    emit(oldAudio, 'playing');
    emit(oldAudio, 'timeupdate', 5);
    emit(oldAudio, 'ended');
    expect(onListeningProgress).toHaveBeenCalledTimes(1);
    emit(currentAudio, 'playing');
    emit(currentAudio, 'timeupdate', 2);
    expect(onListeningProgress).toHaveBeenLastCalledWith(second, 2);
    expect(totalListening(onListeningProgress)).toBe(3);
  });

  it('uses current metadata and callbacks without restarting the stream', () => {
    const station = createStation();
    const initialProgress = vi.fn();
    const currentProgress = vi.fn();
    const { rerender } = renderHook((options: AudioPlayerOptions) => useAudioPlayer(options), {
      initialProps: { station, isPlaying: true, onListeningProgress: initialProgress },
    });
    const audio = MockAudio.instances[0];
    emit(audio, 'playing');
    emit(audio, 'timeupdate', 1);
    const updated = { ...station, name: 'Updated FM', votes: 10 };
    rerender({ station: updated, isPlaying: true, onListeningProgress: currentProgress });
    emit(audio, 'timeupdate', 2);
    expect(currentProgress).toHaveBeenCalledWith(updated, 1);
    expect(initialProgress).toHaveBeenCalledTimes(1);
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(MockAudio.instances).toHaveLength(1);
  });

  it('changes transient gain without restarting audio or saving the faded volume', () => {
    const station = createStation();
    const { result, rerender } = renderHook(
      (options: AudioPlayerOptions) => useAudioPlayer(options),
      { initialProps: { station, isPlaying: true, gain: 1 } }
    );
    const audio = MockAudio.instances[0];
    act(() => result.current.setVolume(0.6));
    emit(audio, 'playing');
    rerender({ station, isPlaying: true, gain: 0.25 });
    expect(audio.volume).toBeCloseTo(0.15);
    expect(result.current.volume).toBe(0.6);
    expect(JSON.parse(localStorage.getItem('radioExplorerAudio')!)).toEqual({
      volume: 0.6,
      muted: false,
    });
    rerender({ station, isPlaying: true, gain: 0 });
    expect(audio.volume).toBe(0);
    rerender({ station, isPlaying: true, gain: 1 });
    expect(audio.volume).toBe(0.6);
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(MockAudio.instances).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem('radioExplorerAudio')!)).toEqual({
      volume: 0.6,
      muted: false,
    });
  });

  it('clamps gain safely and keeps mute stronger than the transient gain', () => {
    const station = createStation();
    const { result, rerender } = renderHook(
      (options: AudioPlayerOptions) => useAudioPlayer(options),
      { initialProps: { station, isPlaying: true, gain: 1 } }
    );
    const audio = MockAudio.instances[0];
    rerender({ station, isPlaying: true, gain: 2 });
    expect(audio.volume).toBe(0.8);
    rerender({ station, isPlaying: true, gain: -1 });
    expect(audio.volume).toBe(0);
    rerender({ station, isPlaying: true, gain: Number.NaN });
    expect(audio.volume).toBe(0.8);
    act(() => result.current.toggleMute());
    rerender({ station, isPlaying: true, gain: 0.25 });
    expect(audio.volume).toBe(0);
    expect(JSON.parse(localStorage.getItem('radioExplorerAudio')!)).toEqual({
      volume: 0.8,
      muted: true,
    });
  });
});
