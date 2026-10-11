export type AudioContentKind = 'music' | 'speech' | 'ambient' | 'unknown';
export type AudioCharacter = 'intense' | 'soft' | 'neutral';
export const AUDIO_CONTENT_CONFIDENCE = 0.5;

export interface AudioSemantic {
  kind: AudioContentKind;
  character: AudioCharacter;
  confidence: number;
  characterConfidence?: number;
  model: string | null;
  updatedAt: number;
}

export interface AudioAnalysisFrame {
  spectrum: Float32Array;
  waveform: Float32Array;
  rms: number;
  peak: number;
  bass: number;
  mid: number;
  treble: number;
  onset: number;
  updatedAt: number;
  status: 'idle' | 'analyzing' | 'unavailable';
  volumeApplied: boolean;
  semantic: AudioSemantic;
}

export function createAudioAnalysis(): AudioAnalysisFrame {
  return {
    spectrum: new Float32Array(64),
    waveform: new Float32Array(256),
    rms: 0,
    peak: 0,
    bass: 0,
    mid: 0,
    treble: 0,
    onset: 0,
    updatedAt: 0,
    status: 'idle',
    volumeApplied: false,
    semantic: {
      kind: 'unknown',
      character: 'neutral',
      confidence: 0,
      characterConfidence: 0,
      model: null,
      updatedAt: 0,
    },
  };
}

export function resetAudioAnalysis(frame: AudioAnalysisFrame) {
  frame.spectrum.fill(0);
  frame.waveform.fill(0);
  frame.rms = 0;
  frame.peak = 0;
  frame.bass = 0;
  frame.mid = 0;
  frame.treble = 0;
  frame.onset = 0;
  frame.updatedAt = 0;
  frame.status = 'idle';
  frame.volumeApplied = false;
  frame.semantic = createAudioAnalysis().semantic;
}

export function createFrequencyBands(sampleRate: number, fftSize: number, count = 64) {
  const bands = new Uint16Array(count + 1);
  const lower = 45;
  const upper = Math.min(16000, sampleRate / 2);
  for (let i = 0; i <= count; i++) {
    bands[i] = Math.min(
      fftSize / 2 - 1,
      Math.max(1, Math.round((lower * (upper / lower) ** (i / count) * fftSize) / sampleRate))
    );
  }
  return bands;
}

export function updateAudioFeatures(
  frame: AudioAnalysisFrame,
  frequency: Uint8Array,
  samples: Float32Array,
  bands: Uint16Array,
  now: number
) {
  let square = 0;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const sample = Number.isFinite(samples[i]) ? samples[i] : 0;
    square += sample * sample;
    peak = Math.max(peak, Math.abs(sample));
  }
  const rms = Math.min(1, Math.sqrt(square / samples.length));
  let flux = 0;
  let bass = 0;
  let mid = 0;
  let treble = 0;
  for (let i = 0; i < frame.spectrum.length; i++) {
    const start = bands[i];
    const end = Math.max(start + 1, bands[i + 1]);
    let magnitude = 0;
    for (let bin = start; bin < end && bin < frequency.length; bin++) {
      magnitude = Math.max(magnitude, frequency[bin] / 255);
    }
    magnitude *= magnitude;
    flux += Math.max(0, magnitude - frame.spectrum[i]);
    frame.spectrum[i] = magnitude;
    if (i < 20) bass += magnitude;
    else if (i < 44) mid += magnitude;
    else treble += magnitude;
  }
  for (let i = 0; i < frame.waveform.length; i++) {
    frame.waveform[i] = samples[Math.floor((i * samples.length) / frame.waveform.length)] || 0;
  }
  frame.rms = rms;
  frame.peak = Math.min(1, peak);
  frame.bass = bass / 20;
  frame.mid = mid / 24;
  frame.treble = treble / 20;
  frame.onset = Math.min(1, flux / 8);
  frame.updatedAt = now;
  frame.status = 'analyzing';
}

export function parseAudioSemantic(input: unknown, now: number): AudioSemantic | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Record<string, unknown>;
  if (
    !['music', 'speech', 'ambient', 'unknown'].includes(String(value.kind)) ||
    !['intense', 'soft', 'neutral'].includes(String(value.character)) ||
    typeof value.confidence !== 'number' ||
    !Number.isFinite(value.confidence) ||
    typeof value.model !== 'string' ||
    value.model !== 'facebook/pe-av-large'
  )
    return null;
  return {
    kind: value.kind as AudioContentKind,
    character:
      typeof value.characterConfidence === 'number' &&
      Number.isFinite(value.characterConfidence) &&
      value.characterConfidence >= 0.55
        ? (value.character as AudioCharacter)
        : 'neutral',
    characterConfidence:
      typeof value.characterConfidence === 'number' && Number.isFinite(value.characterConfidence)
        ? Math.max(0, Math.min(1, value.characterConfidence))
        : 0,
    confidence: Math.max(0, Math.min(1, value.confidence)),
    model: value.model,
    updatedAt: now,
  };
}
