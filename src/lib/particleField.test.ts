import { startParticleField } from './particleField';

describe('particle rendering budget', () => {
  let pending: Map<number, FrameRequestCallback>;
  let nextFrame: number;
  let context: ReturnType<typeof createContext>;

  function createContext() {
    return {
      clearRect: vi.fn(),
      setTransform: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
    };
  }

  function advance(time: number) {
    const callbacks = Array.from(pending.values());
    pending.clear();
    for (const callback of callbacks) callback(time);
  }

  beforeEach(() => {
    pending = new Map();
    nextFrame = 0;
    context = createContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as ReturnType<HTMLCanvasElement['getContext']>
    );
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) =>
        Object.assign(new EventTarget(), {
          matches: false,
          media: query,
        }) as MediaQueryList
    );
    vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(8);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      pending.set(++nextFrame, callback);
      return nextFrame;
    });
    vi.stubGlobal('cancelAnimationFrame', (frame: number) => pending.delete(frame));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps full-screen drawing near 30 fps on a 120 Hz display and batches submissions', () => {
    const stop = startParticleField(document.createElement('canvas'))!;
    for (let index = 0; index < 120; index++) advance(1 + (index * 1000) / 120);
    const draws = context.clearRect.mock.calls.length;
    expect(draws).toBeGreaterThanOrEqual(29);
    expect(draws).toBeLessThanOrEqual(31);
    expect(context.fill).toHaveBeenCalledTimes(draws * 14);
    expect(context.stroke).toHaveBeenCalledTimes(draws * 8);
    stop();
    expect(pending.size).toBe(0);
  });

  it('limits the backing buffer on high-density screens', () => {
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(3);
    const canvas = document.createElement('canvas');
    const stop = startParticleField(canvas)!;
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(2_604_000);
    expect(canvas.width).toBeGreaterThan(0);
    stop();
  });

  it('suspends hidden-page rendering and resumes without accumulating a time jump', () => {
    const stop = startParticleField(document.createElement('canvas'))!;
    advance(1);
    const draws = context.clearRect.mock.calls.length;
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    advance(10_000);
    expect(context.clearRect).toHaveBeenCalledTimes(draws);
    expect(pending.size).toBe(0);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    advance(20_000);
    expect(context.clearRect).toHaveBeenCalledTimes(draws + 1);
    stop();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(pending.size).toBe(0);
  });
});
