import { createStation } from '../test/fixtures';
import { act, render, screen, waitFor } from '@testing-library/react';
import Player from './Player';

describe('Player', () => {
  const pauseMock = vi.fn();
  const playMock = vi.fn();
  let audioInstances: HTMLAudioElement[];

  beforeEach(() => {
    localStorage.clear();
    pauseMock.mockReset();
    playMock.mockReset();
    playMock.mockRejectedValue(new Error('autoplay blocked'));
    audioInstances = [];

    class MockAudio extends EventTarget {
      constructor() {
        super();
        audioInstances.push(this as unknown as HTMLAudioElement);
      }
      src = '';
      preload = '';
      crossOrigin: string | null = null;
      volume = 1;
      paused = true;

      play = playMock;
      pause = pauseMock;
      removeAttribute = vi.fn();
      load = vi.fn();
    }

    vi.stubGlobal('Audio', MockAudio as unknown as typeof Audio);
  });

  const props = {
    station: createStation(),
    isPlaying: true,
    onTogglePlay: vi.fn(),
    isFavorite: false,
    onToggleFavorite: vi.fn(),
  };

  it('starts only once and does not restart for a metadata-only update', async () => {
    playMock.mockResolvedValue(undefined);
    const { rerender } = render(<Player {...props} />);
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    rerender(<Player {...props} station={{ ...props.station, votes: 100 }} />);
    expect(playMock).toHaveBeenCalledTimes(1);
    expect(audioInstances).toHaveLength(1);
  });

  it('ignores a previous station rejection and late audio events after switching', async () => {
    let rejectOld: (error: Error) => void;
    playMock.mockImplementationOnce(
      () =>
        new Promise<void>((_, reject) => {
          rejectOld = reject;
        })
    );
    playMock.mockResolvedValue(undefined);
    const onPlaybackError = vi.fn();
    const onPlayingChange = vi.fn();
    const { rerender } = render(
      <Player {...props} onPlaybackError={onPlaybackError} onPlayingChange={onPlayingChange} />
    );
    rerender(
      <Player
        {...props}
        station={{ ...props.station, stationuuid: 'new', url_resolved: 'https://example.com/new' }}
        onPlaybackError={onPlaybackError}
        onPlayingChange={onPlayingChange}
      />
    );
    await act(async () => {
      rejectOld(new Error('Old stream failed'));
      audioInstances[0].dispatchEvent(new Event('error'));
      audioInstances[0].dispatchEvent(new Event('pause'));
    });
    expect(onPlaybackError.mock.calls.every(([message]) => message === null)).toBe(true);
    expect(onPlayingChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(playMock).toHaveBeenCalledTimes(2);
  });

  it('ignores a pending play rejection after pausing', async () => {
    let rejectPlay: (error: Error) => void;
    playMock.mockImplementation(
      () =>
        new Promise<void>((_, reject) => {
          rejectPlay = reject;
        })
    );
    const onPlaybackError = vi.fn();
    const { rerender } = render(<Player {...props} onPlaybackError={onPlaybackError} />);
    expect(screen.getByRole('status')).toHaveTextContent('Connecting');
    rerender(<Player {...props} isPlaying={false} onPlaybackError={onPlaybackError} />);
    await act(async () => {
      rejectPlay(new DOMException('Interrupted', 'AbortError'));
    });
    expect(screen.getByRole('button', { name: 'Play station' })).toBeInTheDocument();
    expect(onPlaybackError.mock.calls.every(([message]) => message === null)).toBe(true);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it.each(['error', 'ended', 'pause'])(
    'notifies the parent when the active audio emits %s',
    async (event) => {
      playMock.mockResolvedValue(undefined);
      const onPlayingChange = vi.fn();
      render(<Player {...props} onPlayingChange={onPlayingChange} />);
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        audioInstances[0].dispatchEvent(new Event(event));
        await Promise.resolve();
      });
      if (event === 'error') {
        expect(onPlayingChange).not.toHaveBeenCalled();
        expect(audioInstances[1].crossOrigin).toBeNull();
        act(() => audioInstances[1].dispatchEvent(new Event('error')));
      }
      expect(onPlayingChange).toHaveBeenCalledWith(false);
      if (event === 'error')
        expect(screen.getByText(/stream is currently unavailable/i)).toBeInTheDocument();
    }
  );

  it('shows buffering until the active audio resumes playing', async () => {
    playMock.mockResolvedValue(undefined);
    const { container } = render(<Player {...props} />);
    const visualizer = container.querySelector('[data-audio-visualizer]');
    expect(visualizer).toHaveAttribute('data-audio-visualizer', 'idle');
    await act(async () => {
      await Promise.resolve();
    });
    expect(visualizer).toHaveAttribute('data-audio-visualizer', 'playing');
    act(() => {
      audioInstances[0].dispatchEvent(new Event('waiting'));
    });
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(visualizer).toHaveAttribute('data-audio-visualizer', 'idle');
    act(() => {
      audioInstances[0].dispatchEvent(new Event('playing'));
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(visualizer).toHaveAttribute('data-audio-visualizer', 'playing');
  });

  it('does not play an empty stream and resets the parent intent', () => {
    const onPlayingChange = vi.fn();
    render(
      <Player
        {...props}
        station={{ ...props.station, url: '', url_resolved: '' }}
        onPlayingChange={onPlayingChange}
      />
    );
    expect(playMock).not.toHaveBeenCalled();
    expect(onPlayingChange).toHaveBeenCalledWith(false);
    expect(screen.getByText(/stream is currently unavailable/i)).toBeInTheDocument();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows playback error text and notifies parent when playback fails', async () => {
    const onPlaybackError = vi.fn();

    render(
      <Player
        station={createStation()}
        isPlaying
        onTogglePlay={() => undefined}
        isFavorite={false}
        onToggleFavorite={() => undefined}
        onPlaybackError={onPlaybackError}
      />
    );

    await waitFor(() =>
      expect(screen.getByText(/Autoplay was blocked by your browser/i)).toBeInTheDocument()
    );
    expect(onPlaybackError).toHaveBeenCalled();
    expect(onPlaybackError).toHaveBeenLastCalledWith(
      expect.stringContaining('Autoplay was blocked')
    );
  });
});
