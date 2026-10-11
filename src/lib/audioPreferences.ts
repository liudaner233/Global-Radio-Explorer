const STORAGE_KEY = 'radioExplorerAudio';
const defaults = { volume: 0.8, muted: false };

export function readAudioPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return defaults;
    return {
      volume:
        typeof saved.volume === 'number' && Number.isFinite(saved.volume)
          ? Math.min(1, Math.max(0, saved.volume))
          : defaults.volume,
      muted: typeof saved.muted === 'boolean' ? saved.muted : defaults.muted,
    };
  } catch {
    return defaults;
  }
}

export function saveAudioPreferences(volume: number, muted: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ volume, muted }));
  } catch {
    return;
  }
}
