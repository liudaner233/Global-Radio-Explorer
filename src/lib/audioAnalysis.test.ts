import {
  createAudioAnalysis,
  createFrequencyBands,
  parseAudioSemantic,
  resetAudioAnalysis,
  updateAudioFeatures,
} from './audioAnalysis';

describe('real audio features', () => {
  const bands = createFrequencyBands(48000, 2048);

  it('reports silence as silence rather than generating synthetic motion', () => {
    const frame = createAudioAnalysis();
    updateAudioFeatures(frame, new Uint8Array(1024), new Float32Array(2048), bands, 100);
    expect(frame.rms).toBe(0);
    expect(frame.peak).toBe(0);
    expect(frame.onset).toBe(0);
    expect(frame.spectrum.every((value) => value === 0)).toBe(true);
    expect(frame.waveform.every((value) => value === 0)).toBe(true);
    expect(frame.semantic.kind).toBe('unknown');
  });

  it('distinguishes a real low-frequency transient from sustained high-frequency content', () => {
    const frame = createAudioAnalysis();
    const spectrum = new Uint8Array(1024);
    spectrum.fill(240, 2, 20);
    const pcm = new Float32Array(2048).fill(0.2);
    const originalSpectrum = frame.spectrum;
    const originalWaveform = frame.waveform;
    updateAudioFeatures(frame, spectrum, pcm, bands, 150);
    expect(frame.rms).toBeCloseTo(0.2);
    expect(frame.bass).toBeGreaterThan(frame.treble);
    expect(frame.onset).toBeGreaterThan(0);
    updateAudioFeatures(frame, spectrum, pcm, bands, 175);
    expect(frame.onset).toBe(0);
    spectrum.fill(0);
    spectrum.fill(220, 200);
    updateAudioFeatures(frame, spectrum, pcm, bands, 200);
    expect(frame.treble).toBeGreaterThan(frame.bass);
    expect(frame.spectrum).toBe(originalSpectrum);
    expect(frame.waveform).toBe(originalWaveform);
  });

  it('clears the previous station signal and model prediction on a source change', () => {
    const frame = createAudioAnalysis();
    updateAudioFeatures(
      frame,
      new Uint8Array(1024).fill(200),
      new Float32Array(2048).fill(0.3),
      bands,
      100
    );
    frame.semantic = {
      kind: 'music',
      character: 'intense',
      confidence: 0.9,
      model: 'facebook/pe-av-large',
      updatedAt: 100,
    };
    resetAudioAnalysis(frame);
    expect(frame.rms).toBe(0);
    expect(frame.semantic.model).toBeNull();
    expect(frame.semantic.confidence).toBe(0);
    expect(frame.spectrum.every((value) => value === 0)).toBe(true);
  });

  it('rejects malformed, nonfinite, and unrelated model responses', () => {
    const valid = {
      kind: 'speech',
      character: 'soft',
      confidence: 0.8,
      model: 'facebook/pe-av-large',
    };
    expect(parseAudioSemantic(valid, 100)?.updatedAt).toBe(100);
    expect(parseAudioSemantic({ ...valid, model: 'synthetic' }, 100)).toBeNull();
    expect(parseAudioSemantic({ ...valid, confidence: Number.NaN }, 100)).toBeNull();
    expect(parseAudioSemantic({ ...valid, kind: 'happy' }, 100)).toBeNull();
    expect(parseAudioSemantic(null, 100)).toBeNull();
  });

  it('preserves expressive results only when the separate expression confidence supports them', () => {
    const result = {
      kind: 'music',
      character: 'soft',
      confidence: 0.53,
      characterConfidence: 0.61,
      model: 'facebook/pe-av-large',
    };
    expect(parseAudioSemantic(result, 100)?.character).toBe('soft');
    expect(parseAudioSemantic({ ...result, characterConfidence: 0.4 }, 100)?.character).toBe(
      'neutral'
    );
    expect(parseAudioSemantic({ ...result, characterConfidence: Number.NaN }, 100)?.character).toBe(
      'neutral'
    );
  });
});
