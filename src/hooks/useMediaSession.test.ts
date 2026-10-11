import { cleanup, renderHook } from '@testing-library/react';
import { createStation } from '../test/fixtures';
import { useMediaSession } from './useMediaSession';

describe('system media controls', () => {
  let handlers: Map<string, (() => void) | null>;
  let session: {
    setActionHandler: ReturnType<typeof vi.fn>;
    metadata: MediaMetadata | null;
    playbackState: string;
  };
  let original: PropertyDescriptor | undefined;

  beforeEach(() => {
    original = Object.getOwnPropertyDescriptor(navigator, 'mediaSession');
    handlers = new Map();
    session = {
      metadata: null,
      playbackState: 'none',
      setActionHandler: vi.fn((action, handler) => handlers.set(action, handler)),
    };
    Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: session });
    vi.stubGlobal(
      'MediaMetadata',
      class {
        constructor(data: MediaMetadataInit) {
          Object.assign(this, data);
        }
      }
    );
  });
  afterEach(() => {
    cleanup();
    if (original) Object.defineProperty(navigator, 'mediaSession', original);
    else Reflect.deleteProperty(navigator, 'mediaSession');
    vi.unstubAllGlobals();
  });

  it('keeps metadata, native playback state and current callbacks in sync and cleans up', () => {
    const toggle = vi.fn();
    const updatedToggle = vi.fn();
    const station = createStation({ name: 'Live Jazz', country: 'France' });
    const { rerender, unmount } = renderHook(
      ({ playing, callback }) =>
        useMediaSession(station, playing, playing ? 'playing' : 'paused', callback),
      { initialProps: { playing: true, callback: toggle } }
    );
    expect(session.metadata).toMatchObject({ title: 'Live Jazz', artist: 'France' });
    expect(session.playbackState).toBe('playing');
    handlers.get('play')!();
    expect(toggle).not.toHaveBeenCalled();
    handlers.get('pause')!();
    expect(toggle).toHaveBeenCalledTimes(1);
    rerender({ playing: false, callback: updatedToggle });
    expect(session.playbackState).toBe('paused');
    handlers.get('pause')!();
    expect(updatedToggle).not.toHaveBeenCalled();
    handlers.get('play')!();
    expect(updatedToggle).toHaveBeenCalledTimes(1);
    unmount();
    expect([...handlers.values()].every((handler) => handler === null)).toBe(true);
    expect(session.metadata).toBeNull();
    expect(session.playbackState).toBe('none');
  });

  it('tolerates unsupported system actions and ignores unsafe artwork URLs', () => {
    session.setActionHandler.mockImplementation(() => {
      throw new DOMException('Unsupported', 'NotSupportedError');
    });
    const { unmount } = renderHook(() =>
      useMediaSession(createStation({ favicon: 'javascript:alert(1)' }), true, 'loading', vi.fn())
    );
    expect(session.metadata).toMatchObject({ artwork: [] });
    expect(session.playbackState).toBe('paused');
    expect(unmount).not.toThrow();
  });

  it('uses current journey callbacks and disables unavailable route directions', () => {
    const firstNext = vi.fn();
    const next = vi.fn();
    const previous = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ back, forward }: { back?: () => void; forward?: () => void }) =>
        useMediaSession(createStation(), true, 'playing', vi.fn(), back, forward),
      { initialProps: { back: undefined, forward: firstNext } }
    );
    expect(handlers.get('previoustrack')).toBeNull();
    handlers.get('nexttrack')!();
    expect(firstNext).toHaveBeenCalledOnce();
    rerender({ back: previous, forward: next });
    handlers.get('previoustrack')!();
    handlers.get('nexttrack')!();
    expect(previous).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
    expect(firstNext).toHaveBeenCalledOnce();
    rerender({ back: previous, forward: undefined });
    expect(handlers.get('nexttrack')).toBeNull();
    unmount();
    expect(handlers.get('previoustrack')).toBeNull();
  });
});
