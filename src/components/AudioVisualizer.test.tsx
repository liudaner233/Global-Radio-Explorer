import { render } from '@testing-library/react';
import { createAudioAnalysis } from '../lib/audioAnalysis';
import AudioVisualizer from './AudioVisualizer';

describe('AudioVisualizer animation lifecycle', () => {
  let pending: Map<number, FrameRequestCallback>;
  let nextFrame: number;
  let context: ReturnType<typeof createContext>;
  const disconnect = vi.fn();

  function createContext() {
    return {
      clearRect: vi.fn(),
      setTransform: vi.fn(),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
    };
  }

  function advance(time: number) {
    const callbacks = Array.from(pending.values());
    pending.clear();
    for (const callback of callbacks) callback(time);
  }

  function activeAnalysis() {
    const snapshot = createAudioAnalysis();
    snapshot.status = 'analyzing';
    snapshot.spectrum.fill(0.6);
    snapshot.waveform.fill(0.2);
    snapshot.rms = 0.3;
    snapshot.peak = 0.4;
    return { current: snapshot };
  }

  beforeEach(() => {
    pending = new Map();
    nextFrame = 0;
    context = createContext();
    disconnect.mockClear();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as ReturnType<HTMLCanvasElement['getContext']>
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 704,
      height: 96,
    } as DOMRect);
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) =>
        Object.assign(new EventTarget(), {
          matches: false,
          media: query,
        }) as MediaQueryList
    );
    vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(8);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect = disconnect;
      }
    );
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      pending.set(++nextFrame, callback);
      return nextFrame;
    });
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((frame: number) => pending.delete(frame))
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('caps high-refresh draws while preserving frequency bars and the real waveform', () => {
    const { unmount } = render(<AudioVisualizer isPlaying analysis={activeAnalysis()} gain={1} />);
    for (let index = 0; index < 120; index++) advance(1 + (index * 1000) / 120);
    expect(context.clearRect.mock.calls.length).toBeGreaterThanOrEqual(39);
    expect(context.clearRect.mock.calls.length).toBeLessThanOrEqual(45);
    expect(context.roundRect.mock.calls.some((call) => call[3] > 1.7)).toBe(true);
    expect(context.lineTo).toHaveBeenCalled();
    expect(context.createLinearGradient).toHaveBeenCalledTimes(1);
    unmount();
    expect(pending.size).toBe(0);
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('keeps the current animation when its parent renders unchanged playback options', () => {
    const analysis = activeAnalysis();
    const { rerender, unmount } = render(
      <AudioVisualizer isPlaying analysis={analysis} gain={1} />
    );
    const canceled = vi.mocked(cancelAnimationFrame).mock.calls.length;
    const scheduled = pending.size;
    rerender(<AudioVisualizer isPlaying analysis={analysis} gain={1} />);
    expect(cancelAnimationFrame).toHaveBeenCalledTimes(canceled);
    expect(pending.size).toBe(scheduled);
    unmount();
  });

  it('draws a flat idle signal when analysis is unavailable despite a playing stream', () => {
    const analysis = activeAnalysis();
    analysis.current.status = 'unavailable';
    const { unmount } = render(<AudioVisualizer isPlaying analysis={analysis} gain={1} />);
    advance(1);
    expect(context.roundRect.mock.calls.every((call) => call[3] === 1.7)).toBe(true);
    expect(context.lineTo).not.toHaveBeenCalled();
    unmount();
  });

  it('does not render while hidden and cleans up after returning to the foreground', () => {
    const { unmount } = render(<AudioVisualizer isPlaying analysis={activeAnalysis()} gain={1} />);
    advance(1);
    const draws = context.clearRect.mock.calls.length;
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    advance(10_000);
    expect(context.clearRect).toHaveBeenCalledTimes(draws);
    expect(pending.size).toBe(0);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    advance(11_000);
    expect(context.clearRect).toHaveBeenCalledTimes(draws + 1);
    unmount();
    expect(pending.size).toBe(0);
  });
});
