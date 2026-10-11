import { parseAudioSemantic } from '../lib/audioAnalysis';

let pending: AbortController | null = null;

self.onmessage = async (event: MessageEvent) => {
  if (event.data.type === 'cancel') {
    pending?.abort();
    return;
  }
  if (event.data.type !== 'analyze' || pending) return;
  const pcm = event.data.pcm as Float32Array;
  const sampleRate = Number(event.data.sampleRate);
  pending = new AbortController();
  const timeout = setTimeout(() => pending?.abort(), 90000);
  try {
    const response = await fetch('/api/audio/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Sample-Rate': String(sampleRate) },
      body: pcm.buffer as ArrayBuffer,
      signal: pending.signal,
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error(`Audio model ${response.status}`);
    const semantic = parseAudioSemantic(await response.json(), performance.now());
    if (!semantic) throw new Error('Invalid audio analysis');
    self.postMessage({ type: 'result', semantic, pcm }, { transfer: [pcm.buffer] });
  } catch {
    self.postMessage({ type: 'error', pcm }, { transfer: [pcm.buffer] });
  } finally {
    clearTimeout(timeout);
    pending = null;
  }
};
