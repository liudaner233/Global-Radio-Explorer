import { useEffect, useRef, type RefObject } from 'react';
import type { AudioAnalysisFrame } from '../lib/audioAnalysis';
import { AUDIO_CONTENT_CONFIDENCE } from '../lib/audioAnalysis';

interface AudioVisualizerProps {
  isPlaying: boolean;
  analysis: RefObject<AudioAnalysisFrame>;
  gain: number;
  hasJourney?: boolean;
}

const PALETTES = {
  neutral: [103, 232, 249, 56, 189, 248, 129, 140, 248],
  soft: [110, 231, 183, 125, 211, 252, 196, 181, 253],
  intense: [45, 212, 191, 56, 189, 248, 251, 146, 160],
  speech: [134, 239, 172, 103, 232, 249, 147, 197, 253],
  ambient: [125, 211, 252, 165, 180, 252, 216, 180, 254],
};

function clamp(value: number, maximum = 1) {
  return Number.isFinite(value) ? Math.max(0, Math.min(maximum, value)) : 0;
}

function getPalette(frame: AudioAnalysisFrame) {
  if (frame.semantic.confidence < AUDIO_CONTENT_CONFIDENCE) return PALETTES.neutral;
  if (frame.semantic.kind === 'speech') return PALETTES.speech;
  if (frame.semantic.kind === 'ambient') return PALETTES.ambient;
  if (frame.semantic.character === 'intense') return PALETTES.intense;
  if (frame.semantic.character === 'soft') return PALETTES.soft;
  return PALETTES.neutral;
}

export default function AudioVisualizer({
  isPlaying,
  analysis,
  gain,
  hasJourney = false,
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const optionsRef = useRef({ isPlaying, gain, hasJourney });
  const wakeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    optionsRef.current = { isPlaying, gain, hasJourney };
    wakeRef.current?.();
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mobile = window.matchMedia('(pointer: coarse)');
    const colors = new Float32Array(PALETTES.neutral);
    let width = 0;
    let height = 0;
    let count = 0;
    let amplitudes = new Float32Array(0);
    let gradient: CanvasGradient;
    let frame = 0;
    let timer = 0;
    let previousTime = 0;
    let gradientTime = 0;
    let visibleEnergy = 0;

    function updateGradient(time: number) {
      if (time - gradientTime < 100 && gradient) return;
      gradientTime = time;
      gradient = context!.createLinearGradient(0, 0, width, 0);
      for (let index = 0; index < 3; index++) {
        const offset = index * 3;
        gradient.addColorStop(
          index / 2,
          'rgb(' +
            Math.round(colors[offset]) +
            ',' +
            Math.round(colors[offset + 1]) +
            ',' +
            Math.round(colors[offset + 2]) +
            ')'
        );
      }
    }

    function draw(time: number, dt: number) {
      const options = optionsRef.current;
      const snapshot = analysis.current;
      const fresh = time - snapshot.updatedAt < 1_500;
      const active =
        options.isPlaying && options.gain > 0 && snapshot.status === 'analyzing' && fresh;
      const audibleGain = active ? Math.sqrt(clamp(options.gain)) : 0;
      const targetEnergy = active ? clamp(Math.sqrt(snapshot.rms * 5)) : 0;
      const speech =
        snapshot.semantic.kind === 'speech' &&
        snapshot.semantic.confidence >= AUDIO_CONTENT_CONFIDENCE;
      const ambient =
        snapshot.semantic.kind === 'ambient' &&
        snapshot.semantic.confidence >= AUDIO_CONTENT_CONFIDENCE;
      const confident = snapshot.semantic.confidence >= AUDIO_CONTENT_CONFIDENCE;
      const gentle = confident && snapshot.semantic.character === 'soft';
      const intense = confident && snapshot.semantic.character === 'intense';
      const attack = ambient ? 0.12 : gentle ? 0.09 : speech ? 0.075 : intense ? 0.025 : 0.035;
      const release = ambient ? 0.55 : gentle ? 0.42 : speech ? 0.32 : intense ? 0.14 : 0.18;
      visibleEnergy +=
        (targetEnergy - visibleEnergy) * (1 - Math.exp(-dt / (gentle ? 0.38 : 0.22)));

      const palette = getPalette(snapshot);
      const colorEase = 1 - Math.exp(-dt / 1.8);
      for (let index = 0; index < colors.length; index++) {
        colors[index] += (palette[index] - colors[index]) * colorEase;
      }
      updateGradient(time);
      context!.clearRect(0, 0, width, height);

      const center = height / 2;
      const gap = options.hasJourney ? 164 : 84;
      const wingWidth = Math.max(0, (width - gap) / 2 - 8);
      const step = wingWidth / count;
      const maxHeight = height * 0.85;
      let settling = visibleEnergy > 0.004;

      context!.fillStyle = gradient;
      context!.beginPath();
      for (let index = 0; index < count; index++) {
        const start = Math.floor((index * snapshot.spectrum.length) / count);
        const end = Math.max(
          start + 1,
          Math.floor(((index + 1) * snapshot.spectrum.length) / count)
        );
        let frequency = 0;
        if (active) {
          for (let bin = start; bin < end; bin++) frequency += clamp(snapshot.spectrum[bin]);
          frequency /= end - start;
        }
        const target =
          Math.pow(frequency, 0.78) *
          audibleGain *
          (0.4 + targetEnergy * 0.6) *
          (gentle ? 0.86 : intense ? 1.1 : 1) *
          (1 + (active ? clamp(snapshot.onset) * 0.22 : 0));
        const easing = 1 - Math.exp(-dt / (target > amplitudes[index] ? attack : release));
        amplitudes[index] += (target - amplitudes[index]) * easing;
        if (amplitudes[index] > 0.004) settling = true;
        const barHeight = 1.7 + clamp(amplitudes[index]) * maxHeight;
        const barWidth = Math.min(2.8, step * 0.52);
        const offset = (index + 0.5) * step;
        context!.roundRect(
          width / 2 - gap / 2 - offset - barWidth / 2,
          center - barHeight / 2,
          barWidth,
          barHeight,
          barWidth / 2
        );
        context!.roundRect(
          width / 2 + gap / 2 + offset - barWidth / 2,
          center - barHeight / 2,
          barWidth,
          barHeight,
          barWidth / 2
        );
      }
      context!.globalAlpha = 0.22 + visibleEnergy * 0.67;
      context!.fill();

      if (active && snapshot.peak > 0.001) {
        context!.save();
        context!.beginPath();
        context!.rect(0, 0, width / 2 - gap / 2, height);
        context!.rect(width / 2 + gap / 2, 0, width / 2 - gap / 2, height);
        context!.clip();
        context!.beginPath();
        const amplitude =
          ((height * 0.19) / Math.max(0.08, snapshot.peak)) *
          audibleGain *
          (0.3 + targetEnergy * 0.7);
        for (let index = 0; index < snapshot.waveform.length; index++) {
          const x = (index * width) / (snapshot.waveform.length - 1);
          const sample = Math.max(-1, Math.min(1, snapshot.waveform[index] || 0));
          const y = center + sample * amplitude;
          if (index === 0) context!.moveTo(x, y);
          else context!.lineTo(x, y);
        }
        context!.strokeStyle = gradient;
        context!.lineWidth = gentle ? 0.85 : intense ? 1.2 : 1;
        context!.globalAlpha = 0.12 + visibleEnergy * 0.3;
        context!.stroke();
        context!.restore();
      }
      context!.globalAlpha = 1;
      return settling;
    }

    function schedule(delay = 0) {
      if (delay) timer = window.setTimeout(() => (frame = requestAnimationFrame(animate)), delay);
      else frame = requestAnimationFrame(animate);
    }

    function animate(time: number) {
      frame = 0;
      timer = 0;
      if (document.hidden) return;
      const dt = previousTime ? Math.min((time - previousTime) / 1_000, 0.3) : 1 / 60;
      previousTime = time;
      const settling = draw(time, dt);
      const options = optionsRef.current;
      if (options.isPlaying && options.gain > 0) {
        const available = analysis.current.status === 'analyzing';
        schedule(motion.matches ? 200 : !available ? 250 : mobile.matches ? 16 : 0);
      } else if (settling) {
        schedule(motion.matches ? 200 : 0);
      } else {
        previousTime = 0;
      }
    }

    function wake() {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      frame = 0;
      timer = 0;
      previousTime = 0;
      if (!document.hidden) schedule();
    }

    function resize() {
      const bounds = canvas!.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      const ratio = Math.min(window.devicePixelRatio || 1, mobile.matches ? 1.5 : 2);
      canvas!.width = Math.round(width * ratio);
      canvas!.height = Math.round(height * ratio);
      context!.setTransform(ratio, 0, 0, ratio, 0, 0);
      count = Math.max(12, Math.min(56, Math.floor((width - 84) / 12)));
      amplitudes = new Float32Array(count);
      gradientTime = -100;
      updateGradient(performance.now());
      wake();
    }

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    wakeRef.current = wake;
    resize();
    document.addEventListener('visibilitychange', wake);
    motion.addEventListener('change', wake);
    mobile.addEventListener('change', resize);

    return () => {
      wakeRef.current = null;
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      observer.disconnect();
      document.removeEventListener('visibilitychange', wake);
      motion.removeEventListener('change', wake);
      mobile.removeEventListener('change', resize);
    };
  }, [analysis]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-audio-visualizer={isPlaying ? 'playing' : 'idle'}
      data-analysis-status={analysis.current.status}
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
