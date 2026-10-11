import { readAudioPreferences, saveAudioPreferences } from './audioPreferences';

describe('audio preferences', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('restores saved volume and mute without saving a playing state', () => {
    saveAudioPreferences(0.35, true);
    expect(readAudioPreferences()).toEqual({ volume: 0.35, muted: true });
    expect(JSON.parse(localStorage.getItem('radioExplorerAudio')!)).toEqual({
      volume: 0.35,
      muted: true,
    });
  });

  it('recovers from corrupt data and clamps saved volume', () => {
    localStorage.setItem('radioExplorerAudio', '{');
    expect(readAudioPreferences()).toEqual({ volume: 0.8, muted: false });
    localStorage.setItem('radioExplorerAudio', JSON.stringify({ volume: 10, muted: 'yes' }));
    expect(readAudioPreferences()).toEqual({ volume: 1, muted: false });
  });

  it('works when browser storage is blocked', () => {
    const blocked = () => {
      throw new DOMException('Blocked', 'SecurityError');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked });
    expect(readAudioPreferences()).toEqual({ volume: 0.8, muted: false });
    expect(() => saveAudioPreferences(0.5, false)).not.toThrow();
  });
});
