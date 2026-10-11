import type { RadioStation } from '../types/radio';

interface AudioCapabilities {
  protocol: 'radio-audio';
  version: 1;
  proxy: boolean;
}

let capabilities: AudioCapabilities | null = null;
let pending: Promise<AudioCapabilities | null> | null = null;
let retryAfter = 0;

export function probeAudioGateway({ force = false } = {}) {
  if (pending) return pending;
  if (capabilities && !force) return Promise.resolve(capabilities);
  if (!force && Date.now() < retryAfter) return Promise.resolve(null);
  pending = fetch('/api/audio/capabilities', {
    signal: AbortSignal.timeout(3000),
    credentials: 'same-origin',
  })
    .then(async (response) => {
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json'))
        return null;
      const value = await response.json();
      if (value?.protocol !== 'radio-audio' || value.version !== 1 || value.proxy !== true)
        return null;
      capabilities = value;
      return capabilities;
    })
    .catch(() => null)
    .then((value) => {
      capabilities = value;
      retryAfter = value ? 0 : Date.now() + 3000;
      return value;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

export function getAudioPlaybackSource(station: RadioStation | null) {
  const direct = station?.url_resolved || station?.url || '';
  if (!station || !direct) return direct;
  if (!capabilities?.proxy && !import.meta.env.DEV) return direct;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(station.stationuuid))
    return direct;
  if (station.hls || /\.m3u8(?:$|\?)/i.test(direct)) return direct;
  try {
    if (new URL(direct, window.location.href).origin === window.location.origin) return direct;
  } catch {
    return direct;
  }
  return `/api/audio/stream/${encodeURIComponent(station.stationuuid)}`;
}
