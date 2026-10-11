import { useEffect, useRef, useState, type RefObject } from 'react';
import { getStationIdentity } from '../lib/favorites';
import {
  createAudioAnalysis,
  createFrequencyBands,
  parseAudioSemantic,
  resetAudioAnalysis,
  updateAudioFeatures,
  AUDIO_CONTENT_CONFIDENCE,
} from '../lib/audioAnalysis';
import type { RadioStation } from '../types/radio';
import pcmCaptureUrl from '../worklets/pcmCapture.worklet.js?url';
import type { AudioAnalysisFrame } from '../lib/audioAnalysis';

type ModelStatus = 'loading' | 'ready' | 'offline' | 'error';
type CaptureAudio = HTMLAudioElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

export function useAudioAnalysis(
  audioRef: RefObject<HTMLAudioElement | null>,
  station: RadioStation | null,
  isPlaying: boolean,
  audioGeneration = 0
) {
  const [analysis] = useState(createAudioAnalysis);
  const analysisRef = useRef<AudioAnalysisFrame>(analysis);
  const playingRef = useRef(isPlaying);
  const wakeRef = useRef<(() => void) | null>(null);
  const [modelStatus, setModelStatus] = useState<ModelStatus>('offline');
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'analyzing' | 'unavailable'>(
    'idle'
  );
  const [description, setDescription] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const identity = getStationIdentity(station);
  const streamUrl = station?.url_resolved || station?.url || '';

  useEffect(() => {
    playingRef.current = isPlaying;
    wakeRef.current?.();
  }, [isPlaying]);

  useEffect(() => {
    const audio = audioRef.current as CaptureAudio | null;
    const data = analysisRef.current;
    resetAudioAnalysis(data);
    setAnalysisStatus('idle');
    setDescription(null);
    setAnalysisError(null);
    setModelStatus('offline');
    if (!audio || !streamUrl) return;

    let disposed = false;
    let initializing = false;
    let context: AudioContext | null = null;
    let capture: MediaStream | null = null;
    let source: MediaStreamAudioSourceNode | MediaElementAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let worklet: AudioWorkletNode | null = null;
    let worker: Worker | null = null;
    let silence: GainNode | null = null;
    let frame = 0;
    let modelTimer = 0;
    let captureTimer = 0;
    let modelReady = false;
    let capturing = false;
    let inferencePending = false;
    let statusRequest: AbortController | null = null;
    let cancelTrackWait: (() => void) | null = null;
    const frequency = new Uint8Array(1024);
    const samples = new Float32Array(2048);
    let bands: Uint16Array;

    function isActive() {
      return (
        !disposed && playingRef.current && !audio!.paused && audio!.volume > 0 && !document.hidden
      );
    }

    function stopCapture() {
      capture?.getTracks().forEach((track) => track.stop());
      capture = null;
    }

    function waitForAudioTrack(stream: MediaStream) {
      if (stream.getAudioTracks().length) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        let retryTimer = 0;
        let timeout = 0;
        let finished = false;
        const finish = (error?: Error) => {
          if (finished) return;
          finished = true;
          clearTimeout(retryTimer);
          clearTimeout(timeout);
          stream.removeEventListener?.('addtrack', check);
          audio!.removeEventListener('loadeddata', check);
          audio!.removeEventListener('canplay', check);
          cancelTrackWait = null;
          if (error) reject(error);
          else resolve();
        };
        const check = () => {
          clearTimeout(retryTimer);
          if (!isActive()) finish(new DOMException('Capture cancelled', 'AbortError'));
          else if (stream.getAudioTracks().length) finish();
          else retryTimer = window.setTimeout(check, 250);
        };
        cancelTrackWait = () => finish(new DOMException('Capture cancelled', 'AbortError'));
        stream.addEventListener?.('addtrack', check);
        audio!.addEventListener('loadeddata', check);
        audio!.addEventListener('canplay', check);
        timeout = window.setTimeout(
          () => finish(new DOMException('No audio track became available', 'NotFoundError')),
          2500
        );
        check();
      });
    }

    function sample(now: number) {
      if (!isActive() || !analyser) {
        frame = 0;
        return;
      }
      analyser.getByteFrequencyData(frequency);
      analyser.getFloatTimeDomainData(samples);
      updateAudioFeatures(data, frequency, samples, bands, now);
      frame = requestAnimationFrame(sample);
    }

    function requestCapture(pcm?: Float32Array) {
      if (
        !modelReady ||
        !isActive() ||
        !worklet ||
        capturing ||
        inferencePending ||
        audio!.volume === 0
      )
        return;
      capturing = true;
      worklet.port.postMessage(
        { type: 'capture', buffer: pcm },
        pcm ? [pcm.buffer as ArrayBuffer] : []
      );
    }

    async function checkModel() {
      clearTimeout(modelTimer);
      if (disposed || document.hidden || !playingRef.current) return;
      statusRequest?.abort();
      const request = new AbortController();
      statusRequest = request;
      const timeout = setTimeout(() => request.abort(), 2500);
      try {
        const response = await fetch('/api/audio/model/status', { signal: request.signal });
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json'))
          throw new Error('Model offline');
        const result = await response.json();
        if (disposed || request.signal.aborted) return;
        modelReady = result.state === 'ready' && result.name === 'facebook/pe-av-large';
        setModelStatus(
          modelReady
            ? 'ready'
            : result.state === 'loading'
              ? 'loading'
              : result.state === 'error'
                ? 'error'
                : 'offline'
        );
        if (modelReady) requestCapture();
      } catch {
        if (!disposed && !request.signal.aborted) {
          modelReady = false;
          setModelStatus('offline');
        }
      } finally {
        clearTimeout(timeout);
        if (!disposed) modelTimer = window.setTimeout(checkModel, modelReady ? 20000 : 5000);
      }
    }

    async function enableModelCapture() {
      if (!context?.audioWorklet || disposed) return;
      try {
        await context.audioWorklet.addModule(pcmCaptureUrl);
        if (disposed || !context || !analyser) return;
        worker = new Worker(new URL('../workers/audioModel.worker.ts', import.meta.url), {
          type: 'module',
        });
        worklet = new AudioWorkletNode(context, 'radio-pcm-capture');
        silence = context.createGain();
        silence.gain.value = 0;
        analyser.connect(worklet);
        worklet.connect(silence);
        silence.connect(context.destination);
        worklet.port.onmessage = ({ data: message }) => {
          capturing = false;
          if (!isActive() || !worker || !modelReady) return;
          inferencePending = true;
          worker.postMessage(
            { type: 'analyze', pcm: message.pcm, sampleRate: message.sampleRate },
            [message.pcm.buffer]
          );
        };
        worker.onmessage = ({ data: message }) => {
          inferencePending = false;
          if (disposed) return;
          if (message.type === 'result' && isActive()) {
            const semantic = parseAudioSemantic(message.semantic, performance.now());
            if (semantic) {
              data.semantic = semantic;
              setModelStatus('ready');
              if (semantic.kind !== 'unknown' && semantic.confidence >= AUDIO_CONTENT_CONFIDENCE) {
                const kind =
                  semantic.kind === 'speech'
                    ? 'Voice'
                    : semantic.kind === 'music'
                      ? 'Music'
                      : 'Ambient';
                const character =
                  semantic.character === 'intense'
                    ? ' · Energetic'
                    : semantic.character === 'soft'
                      ? ' · Gentle'
                      : '';
                setDescription(`${kind}${character}`);
              } else setDescription(null);
            }
          } else if (message.type === 'error') {
            modelReady = false;
            setModelStatus('error');
            data.semantic = createAudioAnalysis().semantic;
            setDescription(null);
            if (isActive()) void checkModel();
          }
          clearTimeout(captureTimer);
          captureTimer = window.setTimeout(() => requestCapture(message.pcm), 1800);
        };
        void checkModel();
      } catch {
        if (!disposed) setModelStatus('error');
      }
    }

    async function start() {
      if (disposed || initializing || audio!.paused || !playingRef.current) return;
      if (context && analyser) {
        await context.resume().catch(() => undefined);
        if (!disposed) wake();
        return;
      }
      initializing = true;
      let restartAfterCancellation = false;
      try {
        setAnalysisError(null);
        if (!window.AudioContext)
          throw new DOMException('Audio analysis unsupported', 'NotSupportedError');
        const currentUrl = new URL(audio!.currentSrc || audio!.src, window.location.href);
        const sameOrigin = currentUrl.origin === window.location.origin;
        const captureStream = audio!.captureStream || audio!.mozCaptureStream;
        let useElementSource = !captureStream;
        if (captureStream) {
          try {
            capture = captureStream.call(audio);
            await waitForAudioTrack(capture);
          } catch (error) {
            stopCapture();
            if (error instanceof Error && error.name === 'AbortError') {
              restartAfterCancellation = isActive();
              return;
            }
            if (!isActive()) return;
            if (!sameOrigin) throw error;
            useElementSource = true;
          }
        }
        if (!isActive()) {
          stopCapture();
          return;
        }
        if (useElementSource && !sameOrigin)
          throw new DOMException('Cross-origin audio capture is blocked', 'SecurityError');
        context = new AudioContext({ sampleRate: 48000 });
        await context.resume();
        if (!isActive()) return;
        analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        analyser.minDecibels = -86;
        analyser.maxDecibels = -18;
        analyser.smoothingTimeConstant = 0.45;
        if (useElementSource) {
          source = context.createMediaElementSource(audio!);
          source.connect(context.destination);
          data.volumeApplied = true;
        } else source = context.createMediaStreamSource(capture!);
        source.connect(analyser);
        bands = createFrequencyBands(context.sampleRate, analyser.fftSize);
        data.status = 'analyzing';
        setAnalysisStatus('analyzing');
        frame = requestAnimationFrame(sample);
        void enableModelCapture();
      } catch (error) {
        if (!disposed && isActive()) {
          data.status = 'unavailable';
          setAnalysisStatus('unavailable');
          const name = error instanceof Error ? error.name : '';
          setAnalysisError(
            name === 'SecurityError'
              ? 'This stream blocks access to its audio samples. Listening continues normally.'
              : name === 'NotFoundError'
                ? 'The stream did not provide an audio track for analysis. Listening continues normally.'
                : name === 'NotSupportedError'
                  ? 'This browser does not support real-time audio analysis.'
                  : 'Audio samples could not be captured in this browser. Listening continues normally.'
          );
          stopCapture();
          if (context && !data.volumeApplied) {
            source?.disconnect();
            analyser?.disconnect();
            void context.close().catch(() => undefined);
            context = null;
            source = null;
            analyser = null;
          }
        }
      } finally {
        if (!disposed && !isActive() && context && !source && !data.volumeApplied) {
          void context.close().catch(() => undefined);
          context = null;
          analyser = null;
          stopCapture();
        }
        initializing = false;
        if (restartAfterCancellation && isActive()) wake();
      }
    }

    function wake() {
      cancelAnimationFrame(frame);
      frame = 0;
      clearTimeout(captureTimer);
      if (isActive()) {
        if (context && analyser) {
          void context
            .resume()
            .then(() => {
              if (!isActive()) return;
              cancelAnimationFrame(frame);
              data.status = 'analyzing';
              frame = requestAnimationFrame(sample);
              requestCapture();
            })
            .catch(() => undefined);
          if (!modelReady) void checkModel();
        } else void start();
      } else {
        cancelTrackWait?.();
        if (initializing && !source) stopCapture();
        data.status = data.status === 'unavailable' ? 'unavailable' : 'idle';
        worklet?.port.postMessage({ type: 'stop' });
        capturing = false;
        worker?.postMessage({ type: 'cancel' });
        statusRequest?.abort();
        clearTimeout(modelTimer);
        if (context && !data.volumeApplied) void context.suspend().catch(() => undefined);
      }
    }

    function resumeFromGesture() {
      if (context?.state === 'suspended' && isActive())
        void context
          .resume()
          .then(wake)
          .catch(() => undefined);
    }

    wakeRef.current = wake;
    audio.addEventListener('playing', wake);
    audio.addEventListener('volumechange', wake);
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('pointerdown', resumeFromGesture, { passive: true });
    wake();

    return () => {
      disposed = true;
      cancelTrackWait?.();
      wakeRef.current = null;
      cancelAnimationFrame(frame);
      clearTimeout(modelTimer);
      clearTimeout(captureTimer);
      statusRequest?.abort();
      worker?.terminate();
      worklet?.disconnect();
      worklet?.port.close();
      analyser?.disconnect();
      source?.disconnect();
      silence?.disconnect();
      stopCapture();
      if (context) void context.close().catch(() => undefined);
      audio.removeEventListener('playing', wake);
      audio.removeEventListener('volumechange', wake);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('pointerdown', resumeFromGesture);
    };
  }, [audioRef, identity, streamUrl, audioGeneration]);

  return { analysisRef, modelStatus, analysisStatus, description, analysisError };
}
