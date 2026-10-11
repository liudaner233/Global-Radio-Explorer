import { createStation } from '../test/fixtures';

describe('audio gateway availability recovery', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('retries a failed capability probe instead of caching its failure for the whole session', async () => {
    vi.resetModules();
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('Temporary connection failure'))
      .mockResolvedValue(Response.json({ protocol: 'radio-audio', version: 1, proxy: true }));
    vi.stubGlobal('fetch', fetch);
    const { probeAudioGateway } = await import('./audioGateway');
    expect(await probeAudioGateway()).toBeNull();
    expect(await probeAudioGateway()).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3001);
    expect(await probeAudioGateway()).toMatchObject({ proxy: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(await probeAudioGateway()).toMatchObject({ proxy: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('refreshes capabilities immediately when the user requests an analysis retry', async () => {
    vi.resetModules();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('<html>Static site</html>', { headers: { 'Content-Type': 'text/html' } })
      )
      .mockResolvedValue(Response.json({ protocol: 'radio-audio', version: 1, proxy: true }));
    vi.stubGlobal('fetch', fetch);
    const { probeAudioGateway, getAudioPlaybackSource } = await import('./audioGateway');
    expect(await probeAudioGateway()).toBeNull();
    expect(await probeAudioGateway({ force: true })).toMatchObject({ proxy: true });
    const station = createStation({ stationuuid: '4aad9a26-15ef-4c13-a947-74c483181b4f' });
    expect(getAudioPlaybackSource(station)).toBe(`/api/audio/stream/${station.stationuuid}`);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
