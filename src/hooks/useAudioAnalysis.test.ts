import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createStation } from '../test/fixtures';
import { useAudioAnalysis } from './useAudioAnalysis';

function createCaptureFixture(src = 'https://example.com/live') {
  const stop = vi.fn();
  class CaptureStream extends EventTarget {
    tracks: Array<{ stop: typeof stop }> = [];
    getAudioTracks() {
      return this.tracks;
    }
    getTracks() {
      return this.tracks;
    }
  }
  const stream = new CaptureStream();
  const captureStream = vi.fn(() => stream);
  const audio = Object.assign(new EventTarget(), {
    src,
    currentSrc: src,
    paused: false,
    volume: 0.8,
    captureStream,
    pause: vi.fn(),
  }) as unknown as HTMLAudioElement;
  const captureSource = { connect: vi.fn(), disconnect: vi.fn() };
  const elementSource = { connect: vi.fn(), disconnect: vi.fn() };
  const analyser = {
    fftSize: 2048,
    minDecibels: -86,
    maxDecibels: -18,
    smoothingTimeConstant: 0.45,
    getByteFrequencyData: vi.fn((values: Uint8Array) => values.fill(80)),
    getFloatTimeDomainData: vi.fn((values: Float32Array) => values.fill(0.05)),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  const contexts: MockAudioContext[] = [];
  class MockAudioContext {
    sampleRate = 48000;
    state = 'running';
    destination = {};
    resume = vi.fn(async () => undefined);
    suspend = vi.fn(async () => undefined);
    close = vi.fn(async () => undefined);
    createMediaStreamSource = vi.fn(() => captureSource);
    createMediaElementSource = vi.fn(() => elementSource);
    createAnalyser = vi.fn(() => analyser);
    constructor() {
      contexts.push(this);
    }
  }
  vi.stubGlobal('AudioContext', MockAudioContext);
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1)
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ state: 'offline', name: 'facebook/pe-av-large' }))
  );
  return {
    audio,
    audioRef: { current: audio },
    station: createStation(),
    stream,
    captureStream,
    captureSource,
    elementSource,
    analyser,
    contexts,
    stop,
  };
}

function createModelFixture() {
  const fixture = createCaptureFixture(`${window.location.origin}/live.mp3`);
  fixture.stream.tracks.push({ stop: fixture.stop });
  const workers: MockWorker[] = [];
  const worklets: MockWorklet[] = [];
  class MockWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    postMessage = vi.fn();
    terminate = vi.fn();
    constructor() {
      workers.push(this);
    }
    respond(data: unknown) {
      this.onmessage?.({ data } as MessageEvent);
    }
  }
  class MockWorklet {
    connect = vi.fn();
    disconnect = vi.fn();
    port = {
      postMessage: vi.fn(),
      close: vi.fn(),
      onmessage: null as ((event: MessageEvent) => void) | null,
    };
    constructor() {
      worklets.push(this);
    }
    completeCapture(pcm: Float32Array) {
      this.port.onmessage?.({ data: { pcm, sampleRate: 48000 } } as MessageEvent);
    }
  }
  Object.assign(AudioContext.prototype, {
    audioWorklet: { addModule: vi.fn(async () => undefined) },
    createGain: vi.fn(() => ({ gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() })),
  });
  const fetchStatus = vi.fn<typeof fetch>(async () =>
    Response.json({ state: 'ready', name: 'facebook/pe-av-large' })
  );
  vi.stubGlobal('fetch', fetchStatus);
  vi.stubGlobal('Worker', MockWorker);
  vi.stubGlobal('AudioWorkletNode', MockWorklet);
  return { ...fixture, workers, worklets, fetchStatus };
}

describe('audio capture isolation', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('never routes an untrusted cross-origin native player into Web Audio', async () => {
    const createSource = vi.fn();
    const createContext = vi.fn(() => ({ createMediaElementSource: createSource }));
    vi.stubGlobal('AudioContext', createContext);
    const audio = Object.assign(new EventTarget(), {
      src: 'https://non-cors.example/stream',
      currentSrc: 'https://non-cors.example/stream',
      paused: false,
      volume: 0.8,
      play: vi.fn(),
      pause: vi.fn(),
    }) as unknown as HTMLAudioElement;
    const { result } = renderHook(() =>
      useAudioAnalysis({ current: audio }, createStation(), true)
    );
    await waitFor(() => expect(result.current.analysisStatus).toBe('unavailable'));
    expect(createContext).not.toHaveBeenCalled();
    expect(createSource).not.toHaveBeenCalled();
    expect(audio.pause).not.toHaveBeenCalled();
    expect(result.current.analysisRef.current.rms).toBe(0);
    expect(result.current.description).toBeNull();
  });

  it('handles a captureStream security error without muting or pausing the native audio', async () => {
    vi.stubGlobal('AudioContext', vi.fn());
    const audio = Object.assign(new EventTarget(), {
      src: 'https://non-cors.example/stream',
      paused: false,
      volume: 0.8,
      captureStream: () => {
        throw new DOMException('Tainted media', 'SecurityError');
      },
      pause: vi.fn(),
    }) as unknown as HTMLAudioElement;
    const { result } = renderHook(() =>
      useAudioAnalysis({ current: audio }, createStation(), true)
    );
    await waitFor(() => expect(result.current.analysisStatus).toBe('unavailable'));
    expect(audio.volume).toBe(0.8);
    expect(audio.pause).not.toHaveBeenCalled();
    expect(result.current.analysisRef.current.semantic.model).toBeNull();
    expect(result.current.analysisError).toContain('blocks access');
  });

  it('can analyze CORS-enabled direct playback when captureStream is unavailable', async () => {
    const fixture = createCaptureFixture();
    Object.assign(fixture.audio, { crossOrigin: 'anonymous' });
    fixture.captureStream.mockImplementation(() => {
      throw new DOMException('Capture unavailable', 'NotSupportedError');
    });
    const { result } = renderHook(() => useAudioAnalysis(fixture.audioRef, fixture.station, true));
    await waitFor(() => expect(result.current.analysisStatus).toBe('analyzing'));
    expect(fixture.contexts[0].createMediaElementSource).toHaveBeenCalledWith(fixture.audio);
    expect(fixture.elementSource.connect).toHaveBeenCalledWith(fixture.contexts[0].destination);
    expect(result.current.analysisError).toBeNull();
    expect(fixture.audio.pause).not.toHaveBeenCalled();
  });

  it('waits for the captured audio track to arrive before initializing the analyser', async () => {
    const fixture = createCaptureFixture();
    const removeListener = vi.spyOn(fixture.stream, 'removeEventListener');
    const { result, unmount } = renderHook(() =>
      useAudioAnalysis(fixture.audioRef, fixture.station, true)
    );
    expect(fixture.captureStream).toHaveBeenCalledOnce();
    expect(result.current.analysisStatus).toBe('idle');
    expect(result.current.analysisError).toBeNull();
    expect(fixture.contexts).toHaveLength(0);
    act(() => {
      fixture.stream.tracks.push({ stop: fixture.stop });
      fixture.stream.dispatchEvent(new Event('addtrack'));
    });
    await waitFor(() => expect(result.current.analysisStatus).toBe('analyzing'));
    expect(fixture.contexts).toHaveLength(1);
    expect(fixture.contexts[0].createMediaStreamSource).toHaveBeenCalledWith(fixture.stream);
    expect(fixture.contexts[0].createMediaElementSource).not.toHaveBeenCalled();
    expect(result.current.analysisError).toBeNull();
    expect(result.current.analysisRef.current.volumeApplied).toBe(false);
    expect(removeListener).toHaveBeenCalledWith('addtrack', expect.any(Function));
    expect(fixture.audio.pause).not.toHaveBeenCalled();
    unmount();
    expect(fixture.stop).toHaveBeenCalledOnce();
  });

  it('detects a delayed audio track even when the browser omits the addtrack event', async () => {
    vi.useFakeTimers();
    const fixture = createCaptureFixture();
    const { result } = renderHook(() => useAudioAnalysis(fixture.audioRef, fixture.station, true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      fixture.stream.tracks.push({ stop: fixture.stop });
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(result.current.analysisStatus).toBe('analyzing');
    expect(fixture.captureStream).toHaveBeenCalledOnce();
    expect(fixture.audio.pause).not.toHaveBeenCalled();
  });

  it('stops waiting after the track deadline without interrupting cross-origin playback', async () => {
    vi.useFakeTimers();
    const fixture = createCaptureFixture();
    const { result } = renderHook(() => useAudioAnalysis(fixture.audioRef, fixture.station, true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(result.current.analysisStatus).toBe('unavailable');
    expect(result.current.analysisError).toContain('did not provide an audio track');
    expect(fixture.contexts).toHaveLength(0);
    expect(fixture.captureStream).toHaveBeenCalledOnce();
    expect(fixture.audio.volume).toBe(0.8);
    expect(fixture.audio.pause).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels track listeners and timers on pause and unmount', async () => {
    vi.useFakeTimers();
    const fixture = createCaptureFixture();
    const removeListener = vi.spyOn(fixture.stream, 'removeEventListener');
    const { result, rerender, unmount } = renderHook(
      ({ playing }) => useAudioAnalysis(fixture.audioRef, fixture.station, playing),
      { initialProps: { playing: true } }
    );
    Object.assign(fixture.audio, { paused: true });
    rerender({ playing: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(result.current.analysisStatus).toBe('idle');
    expect(result.current.analysisError).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(removeListener).toHaveBeenCalledWith('addtrack', expect.any(Function));
    Object.assign(fixture.audio, { paused: false });
    rerender({ playing: true });
    expect(fixture.captureStream).toHaveBeenCalledTimes(2);
    unmount();
    await act(async () => {
      fixture.stream.tracks.push({ stop: fixture.stop });
      fixture.stream.dispatchEvent(new Event('addtrack'));
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(fixture.contexts).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(fixture.audio.pause).not.toHaveBeenCalled();
  });

  it('uses the safe same-origin fallback once when captureStream fails', async () => {
    const fixture = createCaptureFixture(`${window.location.origin}/api/audio/stream/station`);
    fixture.captureStream.mockImplementation(() => {
      throw new DOMException('Capture unavailable', 'SecurityError');
    });
    const { result, rerender } = renderHook(
      ({ playing }) => useAudioAnalysis(fixture.audioRef, fixture.station, playing),
      { initialProps: { playing: true } }
    );
    await waitFor(() => expect(result.current.analysisStatus).toBe('analyzing'));
    const context = fixture.contexts[0];
    expect(context.createMediaElementSource).toHaveBeenCalledExactlyOnceWith(fixture.audio);
    expect(context.createMediaStreamSource).not.toHaveBeenCalled();
    expect(fixture.elementSource.connect).toHaveBeenCalledWith(context.destination);
    expect(fixture.elementSource.connect).toHaveBeenCalledWith(fixture.analyser);
    expect(result.current.analysisRef.current.volumeApplied).toBe(true);
    expect(result.current.analysisError).toBeNull();
    act(() => fixture.audio.dispatchEvent(new Event('volumechange')));
    Object.assign(fixture.audio, { paused: true });
    rerender({ playing: false });
    expect(context.suspend).not.toHaveBeenCalled();
    Object.assign(fixture.audio, { paused: false });
    rerender({ playing: true });
    await act(async () => {
      await Promise.resolve();
    });
    expect(context.createMediaElementSource).toHaveBeenCalledOnce();
    expect(fixture.contexts).toHaveLength(1);
    expect(fixture.audio.pause).not.toHaveBeenCalled();
  });

  it('restarts a pending track wait after an immediate pause and resume', async () => {
    vi.useFakeTimers();
    const fixture = createCaptureFixture();
    const { result, rerender } = renderHook(
      ({ playing }) => useAudioAnalysis(fixture.audioRef, fixture.station, playing),
      { initialProps: { playing: true } }
    );
    Object.assign(fixture.audio, { paused: true });
    rerender({ playing: false });
    Object.assign(fixture.audio, { paused: false });
    rerender({ playing: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fixture.captureStream).toHaveBeenCalledTimes(2);
    expect(result.current.analysisStatus).toBe('idle');
    expect(result.current.analysisError).toBeNull();
    await act(async () => {
      fixture.stream.tracks.push({ stop: fixture.stop });
      fixture.stream.dispatchEvent(new Event('addtrack'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.analysisStatus).toBe('analyzing');
    expect(fixture.contexts).toHaveLength(1);
    expect(fixture.contexts[0].createMediaElementSource).not.toHaveBeenCalled();
    expect(fixture.audio.pause).not.toHaveBeenCalled();
  });

  it('falls back safely for same-origin audio when no captured track becomes available', async () => {
    vi.useFakeTimers();
    const fixture = createCaptureFixture(`${window.location.origin}/test-audio.wav`);
    const { result } = renderHook(() => useAudioAnalysis(fixture.audioRef, fixture.station, true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(result.current.analysisStatus).toBe('analyzing');
    expect(result.current.analysisError).toBeNull();
    expect(result.current.analysisRef.current.volumeApplied).toBe(true);
    expect(fixture.contexts[0].createMediaElementSource).toHaveBeenCalledOnce();
    expect(fixture.audio.pause).not.toHaveBeenCalled();
  });

  it('resumes content analysis when a cancelled inference returns after playback resumes', async () => {
    const connect = vi.fn();
    const disconnect = vi.fn();
    const stop = vi.fn();
    const workers: MockWorker[] = [];
    const worklets: MockWorklet[] = [];
    const fetchStatus = vi.fn(async () =>
      Response.json({ state: 'ready', name: 'facebook/pe-av-large' })
    );
    const audio = Object.assign(new EventTarget(), {
      src: 'https://example.com/live',
      currentSrc: 'https://example.com/live',
      paused: false,
      volume: 0.8,
      captureStream: () => ({
        getAudioTracks: () => [{ stop }],
        getTracks: () => [{ stop }],
      }),
      pause: vi.fn(),
    }) as unknown as HTMLAudioElement;
    const audioRef = { current: audio };
    const station = createStation();

    class MockWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      postMessage = vi.fn();
      terminate = vi.fn();
      constructor() {
        workers.push(this);
      }
      respond(data: unknown) {
        this.onmessage?.({ data } as MessageEvent);
      }
    }

    class MockWorklet {
      connect = connect;
      disconnect = disconnect;
      port = {
        postMessage: vi.fn(),
        close: vi.fn(),
        onmessage: null as ((event: MessageEvent) => void) | null,
      };
      constructor() {
        worklets.push(this);
      }
      completeCapture(pcm: Float32Array) {
        this.port.onmessage?.({ data: { pcm, sampleRate: 48000 } } as MessageEvent);
      }
    }

    class MockAudioContext {
      sampleRate = 48000;
      state = 'running';
      destination = {};
      audioWorklet = { addModule: vi.fn(async () => undefined) };
      resume = vi.fn(async () => {
        this.state = 'running';
      });
      suspend = vi.fn(async () => {
        this.state = 'suspended';
      });
      close = vi.fn(async () => undefined);
      createMediaStreamSource = vi.fn(() => ({ connect, disconnect }));
      createGain = vi.fn(() => ({ gain: { value: 1 }, connect, disconnect }));
      createAnalyser = vi.fn(() => ({
        fftSize: 2048,
        minDecibels: -86,
        maxDecibels: -18,
        smoothingTimeConstant: 0.45,
        getByteFrequencyData: vi.fn((values: Uint8Array) => values.fill(80)),
        getFloatTimeDomainData: vi.fn((values: Float32Array) => values.fill(0.05)),
        connect,
        disconnect,
      }));
    }

    vi.stubGlobal('fetch', fetchStatus);
    vi.stubGlobal('Worker', MockWorker);
    vi.stubGlobal('AudioWorkletNode', MockWorklet);
    vi.stubGlobal('AudioContext', MockAudioContext);

    const { result, rerender, unmount } = renderHook(
      ({ playing }) => useAudioAnalysis(audioRef, station, playing),
      { initialProps: { playing: true } }
    );
    await waitFor(() => expect(result.current.modelStatus).toBe('ready'));
    const worker = workers[0];
    const worklet = worklets[0];
    const captures = () =>
      worklet.port.postMessage.mock.calls.filter(([message]) => message.type === 'capture');
    expect(captures()).toHaveLength(1);

    const pcm = new Float32Array(48000 * 6);
    act(() => worklet.completeCapture(pcm));
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'analyze', pcm, sampleRate: 48000 }, [
      pcm.buffer,
    ]);

    Object.assign(audio, { paused: true });
    rerender({ playing: false });
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'cancel' });
    Object.assign(audio, { paused: false });
    rerender({ playing: true });
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    expect(captures()).toHaveLength(1);

    act(() => worker.respond({ type: 'error', pcm }));
    await waitFor(() => expect(fetchStatus).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(captures()).toHaveLength(2));
    act(() => {
      worklet.completeCapture(pcm);
      worker.respond({
        type: 'result',
        pcm,
        semantic: {
          kind: 'music',
          character: 'soft',
          characterConfidence: 0.8,
          confidence: 0.9,
          model: 'facebook/pe-av-large',
        },
      });
    });
    expect(result.current.description).toBe('Music · Gentle');
    expect(result.current.modelStatus).toBe('ready');
    expect(audio.volume).toBe(0.8);
    expect(audio.pause).not.toHaveBeenCalled();
    expect(
      worker.postMessage.mock.calls.filter(([message]) => message.type === 'analyze')
    ).toHaveLength(2);
    unmount();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worklet.port.close).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
  });

  it('keeps one sampling loop when consecutive audio events resume the context together', async () => {
    const frames = new Map<number, FrameRequestCallback>();
    let frameId = 0;
    const resume = vi.fn(async () => undefined);
    const close = vi.fn(async () => undefined);
    const connect = vi.fn();
    const disconnect = vi.fn();
    const stop = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ state: 'offline', name: 'facebook/pe-av-large' }))
    );
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++frameId, callback);
      return frameId;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    vi.stubGlobal(
      'AudioContext',
      class {
        sampleRate = 48000;
        resume = resume;
        close = close;
        createMediaStreamSource = () => ({ connect, disconnect });
        createAnalyser = () => ({ connect, disconnect });
      }
    );
    const audio = Object.assign(new EventTarget(), {
      src: 'https://example.com/live',
      paused: false,
      volume: 0.8,
      captureStream: () => ({
        getAudioTracks: () => [{ stop }],
        getTracks: () => [{ stop }],
      }),
    }) as unknown as HTMLAudioElement;
    const audioRef = { current: audio };
    const station = createStation();
    const { result, unmount } = renderHook(() => useAudioAnalysis(audioRef, station, true));
    await waitFor(() => expect(result.current.analysisStatus).toBe('analyzing'));
    expect(frames.size).toBe(1);

    const resumes: Array<() => void> = [];
    resume.mockImplementation(() => new Promise<void>((resolve) => resumes.push(resolve)));
    act(() => {
      audio.dispatchEvent(new Event('volumechange'));
      audio.dispatchEvent(new Event('volumechange'));
    });
    expect(resumes).toHaveLength(2);
    expect(frames.size).toBe(0);
    await act(async () => {
      resumes.forEach((resolve) => resolve());
      await Promise.resolve();
    });
    expect(frames.size).toBe(1);
    expect(resume).toHaveBeenCalledTimes(3);
    unmount();
    expect(frames.size).toBe(0);
    expect(close).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
    audio.dispatchEvent(new Event('volumechange'));
    expect(resume).toHaveBeenCalledTimes(3);
  });

  it('rebuilds a crashed recognition worker without replacing or pausing the player', async () => {
    vi.useFakeTimers();
    const fixture = createModelFixture();
    const { result, unmount } = renderHook(() =>
      useAudioAnalysis(fixture.audioRef, fixture.station, true)
    );
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(result.current.modelStatus).toBe('ready');
    act(() => fixture.workers[0].onerror?.(new ErrorEvent('error')));
    expect(result.current.modelStatus).toBe('error');
    expect(fixture.workers[0].terminate).toHaveBeenCalledOnce();
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(fixture.workers).toHaveLength(2);
    expect(result.current.analysisStatus).toBe('analyzing');
    expect(fixture.contexts).toHaveLength(1);
    expect(fixture.audio.pause).not.toHaveBeenCalled();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('recovers when PCM capture never returns instead of remaining permanently busy', async () => {
    vi.useFakeTimers();
    const fixture = createModelFixture();
    const { result, unmount } = renderHook(() =>
      useAudioAnalysis(fixture.audioRef, fixture.station, true)
    );
    await act(async () => vi.advanceTimersByTimeAsync(17000));
    expect(fixture.worklets).toHaveLength(2);
    expect(fixture.worklets[0].port.close).toHaveBeenCalledOnce();
    expect(fixture.worklets[1].port.postMessage).toHaveBeenCalledWith(
      { type: 'capture', buffer: undefined },
      []
    );
    expect(result.current.analysisStatus).toBe('analyzing');
    expect(fixture.audio.pause).not.toHaveBeenCalled();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('backs off a busy model while retaining real-time audio analysis', async () => {
    vi.useFakeTimers();
    const fixture = createModelFixture();
    const { result } = renderHook(() => useAudioAnalysis(fixture.audioRef, fixture.station, true));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    const pcm = new Float32Array(48000 * 6);
    act(() => {
      fixture.worklets[0].completeCapture(pcm);
      fixture.workers[0].respond({ type: 'error', status: 429, pcm });
    });
    expect(result.current.modelStatus).toBe('ready');
    expect(fixture.fetchStatus).toHaveBeenCalledOnce();
    await act(async () => vi.advanceTimersByTimeAsync(4999));
    expect(fixture.worklets[0].port.postMessage).toHaveBeenCalledOnce();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(fixture.worklets[0].port.postMessage).toHaveBeenCalledTimes(2);
    expect(result.current.analysisStatus).toBe('analyzing');
  });

  it('reports a timed-out model status without leaving recognition stuck loading', async () => {
    vi.useFakeTimers();
    const fixture = createModelFixture();
    fixture.fetchStatus
      .mockResolvedValueOnce(Response.json({ state: 'loading', name: 'facebook/pe-av-large' }))
      .mockImplementationOnce(
        (_input, options) =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), {
              once: true,
            });
          })
      );
    const { result, unmount } = renderHook(() =>
      useAudioAnalysis(fixture.audioRef, fixture.station, true)
    );
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(result.current.modelStatus).toBe('loading');
    await act(async () => vi.advanceTimersByTimeAsync(7500));
    expect(result.current.modelStatus).toBe('offline');
    expect(result.current.analysisStatus).toBe('analyzing');
    expect(fixture.audio.pause).not.toHaveBeenCalled();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retries recognition without reconnecting the audible stream', async () => {
    vi.useFakeTimers();
    const fixture = createModelFixture();
    const { result } = renderHook(() => useAudioAnalysis(fixture.audioRef, fixture.station, true));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    const audio = fixture.audioRef.current;
    act(() => result.current.retryRecognition());
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(fixture.workers).toHaveLength(2);
    expect(fixture.workers[0].terminate).toHaveBeenCalledOnce();
    expect(fixture.audioRef.current).toBe(audio);
    expect(fixture.contexts).toHaveLength(1);
    expect(fixture.contexts[0].close).not.toHaveBeenCalled();
    expect(fixture.audio.pause).not.toHaveBeenCalled();
    expect(result.current.modelStatus).toBe('ready');
  });

  it('keeps failed capture retryable when the model service itself remains healthy', async () => {
    vi.useFakeTimers();
    const fixture = createModelFixture();
    const { result, unmount } = renderHook(() =>
      useAudioAnalysis(fixture.audioRef, fixture.station, true)
    );
    await act(async () => vi.advanceTimersByTimeAsync(0));
    for (let attempt = 0; attempt < 4; attempt++) {
      act(() => fixture.workers[attempt].onerror?.(new ErrorEvent('error')));
      if (attempt < 3) await act(async () => vi.advanceTimersByTimeAsync((attempt + 1) * 2000));
    }
    await act(async () => vi.advanceTimersByTimeAsync(20000));
    expect(result.current.modelStatus).toBe('error');
    expect(result.current.analysisStatus).toBe('analyzing');
    expect(fixture.workers).toHaveLength(4);
    act(() => result.current.retryRecognition());
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(fixture.workers).toHaveLength(5);
    expect(result.current.modelStatus).toBe('ready');
    expect(fixture.audio.pause).not.toHaveBeenCalled();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
