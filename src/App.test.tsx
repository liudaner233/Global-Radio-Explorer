import { createStation } from './test/fixtures';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { RadioStation } from './types/radio';

vi.mock('./components/Globe', () => ({
  default: ({ stations }: { stations: RadioStation[] }) => (
    <div data-testid="globe" data-stations={stations.map((station) => station.name).join(',')} />
  ),
}));

const createJsonResponse = (stations: RadioStation[]) =>
  new Response(JSON.stringify(stations), { status: 200 }) as Response;

describe('App', () => {
  const pauseMock = vi.fn();
  const playMock = vi.fn();

  beforeEach(() => {
    pauseMock.mockReset();
    playMock.mockReset();
    playMock.mockResolvedValue(undefined);
    window.localStorage.clear();

    class MockAudio {
      src = '';
      preload = '';
      crossOrigin: string | null = null;
      volume = 1;

      play = playMock;
      pause = pauseMock;
      addEventListener = vi.fn();
      removeEventListener = vi.fn();
      removeAttribute = vi.fn();
      load = vi.fn();
    }

    vi.stubGlobal('Audio', MockAudio as unknown as typeof Audio);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('shows initial stations and switches the player when a station is selected', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          createStation(),
          createStation({
            changeid: '2',
            stationuuid: 'station-2',
            name: 'Jazz FM',
            country: 'France',
            countrycode: 'FR',
          }),
        ]),
        { status: 200 }
      ) as Response
    );

    render(<App />);

    expect(
      await screen.findByRole('heading', { name: /choose a station to start listening/i })
    ).toBeInTheDocument();

    const stationLabel = await screen.findByText('Jazz FM');
    await userEvent.click(stationLabel.closest('button') as HTMLButtonElement);

    await waitFor(() =>
      expect(screen.getAllByRole('heading', { name: 'Jazz FM' })).toHaveLength(2)
    );
    expect(
      screen.queryByRole('heading', { name: /choose a station to start listening/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/France/i)).toBeInTheDocument();
  });

  it('shows a retryable error state when the first load fails', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('Network down'))
      .mockRejectedValueOnce(new Error('Network down'))
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([createStation({ name: 'Recovered FM' })]), {
          status: 200,
        }) as Response
      );

    render(<App />);

    expect(await screen.findAllByText('Network down')).toHaveLength(2);
    const retryButtons = await screen.findAllByRole('button', { name: /retry loading stations/i });
    await userEvent.click(retryButtons[0]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(await screen.findByRole('button', { name: /recovered fm/i })).toBeInTheDocument();
  });

  it('shows a no-data fallback instead of leaving the first screen blank', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }) as Response
    );

    render(<App />);

    expect(await screen.findByText(/No stations available right now/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /No stations available/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry loading stations/i })).toBeInTheDocument();
  });

  it('refreshes the list for a search term and shows an empty results view when the input is cleared', async () => {
    const defaultStation = createStation({ stationuuid: 'default-1', name: 'World News FM' });
    const searchStation = createStation({ stationuuid: 'search-1', name: 'Jazz Nights' });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      const query = url.searchParams.get('name');

      if (query === 'jazz') {
        return createJsonResponse([searchStation]);
      }

      return createJsonResponse([defaultStation]);
    });

    render(<App />);

    expect(await screen.findByText('World News FM')).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(/search stations/i);
    await userEvent.type(searchInput, 'jazz');

    expect((await screen.findAllByText('Jazz Nights')).length).toBeGreaterThan(0);
    expect(screen.queryByText('World News FM')).not.toBeInTheDocument();

    await userEvent.clear(searchInput);

    expect(
      await screen.findByText(/Enter a station name to search the catalog/i)
    ).toBeInTheDocument();
    expect(screen.queryByText('World News FM')).not.toBeInTheDocument();
    expect(screen.queryByText('Jazz Nights')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^trending$/i }));

    expect(await screen.findByText('World News FM')).toBeInTheDocument();
  });

  it('keeps results empty when the results tab is selected with an empty search box', async () => {
    const defaultStation = createStation({ stationuuid: 'default-1', name: 'World News FM' });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(createJsonResponse([defaultStation]));

    render(<App />);

    expect(await screen.findByText('World News FM')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /results/i }));

    expect(
      await screen.findByText(/Enter a station name to search the catalog/i)
    ).toBeInTheDocument();
    expect(screen.queryByText('World News FM')).not.toBeInTheDocument();
  });

  it('keeps the search text and cached results when switching between results and trending', async () => {
    const defaultStation = createStation({ stationuuid: 'default-1', name: 'World News FM' });
    const searchStation = createStation({ stationuuid: 'search-1', name: 'Jazz Nights' });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      const query = url.searchParams.get('name');

      if (query === 'jazz') {
        return createJsonResponse([searchStation]);
      }

      return createJsonResponse([defaultStation]);
    });

    render(<App />);

    expect(await screen.findByText('World News FM')).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(/search stations/i);
    await userEvent.type(searchInput, 'jazz');

    expect(await screen.findByText('Jazz Nights')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^trending$/i }));

    expect(searchInput).toHaveValue('jazz');
    expect(await screen.findByText('World News FM')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /results/i }));

    expect(searchInput).toHaveValue('jazz');
    expect(await screen.findByText('Jazz Nights')).toBeInTheDocument();
    expect(screen.queryByText('World News FM')).not.toBeInTheDocument();
  });

  it('prevents an older search response from overriding a newer query', async () => {
    const defaultStation = createStation({ stationuuid: 'default-1', name: 'World News FM' });
    const olderSearchStation = createStation({ stationuuid: 'old-1', name: 'Japan Radio' });
    const newerSearchStation = createStation({ stationuuid: 'new-1', name: 'Jazz Nights' });

    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = new URL(String(input));
      const query = url.searchParams.get('name');
      const signal = init?.signal as AbortSignal | undefined;

      if (!query) {
        return Promise.resolve(createJsonResponse([defaultStation]));
      }

      return new Promise<Response>((resolve, reject) => {
        const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));

        signal?.addEventListener('abort', onAbort, { once: true });

        const result = query === 'ja' ? [olderSearchStation] : [newerSearchStation];
        const delay = query === 'ja' ? 700 : 100;

        setTimeout(() => {
          signal?.removeEventListener('abort', onAbort);
          if (signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }
          resolve(createJsonResponse(result));
        }, delay);
      });
    });

    render(<App />);

    expect(await screen.findByText('World News FM')).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(/search stations/i);
    await userEvent.type(searchInput, 'ja');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    await userEvent.clear(searchInput);
    await userEvent.type(searchInput, 'jazz');

    expect(await screen.findByText('Jazz Nights')).toBeInTheDocument();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 900));
    });

    expect(screen.queryByText('Japan Radio')).not.toBeInTheDocument();
    expect(screen.getAllByText('Jazz Nights').length).toBeGreaterThan(0);
  }, 10000);

  it('shows a retryable search error and recovers on retry', async () => {
    const defaultStation = createStation({ stationuuid: 'default-1', name: 'World News FM' });
    const recoveredStation = createStation({ stationuuid: 'search-1', name: 'Recovered Jazz' });

    let failedMirrorCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      const query = url.searchParams.get('name');

      if (query === 'jazz') {
        failedMirrorCount += 1;
        if (failedMirrorCount <= 3) {
          throw new Error('Search failed');
        }
        return createJsonResponse([recoveredStation]);
      }

      return createJsonResponse([defaultStation]);
    });

    render(<App />);

    expect(await screen.findByRole('button', { name: /world news fm/i })).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(/search stations/i);
    await userEvent.type(searchInput, 'jazz');

    expect(await screen.findAllByText('Search failed')).toHaveLength(2);

    const retryButtons = screen.getAllByRole('button', { name: /retry loading stations/i });
    await userEvent.click(retryButtons[0]);

    expect(await screen.findByText('Recovered Jazz')).toBeInTheDocument();
  });

  it.each(['search', 'empty results', 'trending'])(
    'keeps refreshed trending data in both list and globe when coming from %s',
    async (view) => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = new URL(String(input));
        const name = url.searchParams.has('name')
          ? 'Jazz Nights'
          : url.searchParams.get('limit') === '200'
            ? 'Old Trending'
            : 'Fresh Trending';
        return createJsonResponse([createStation({ stationuuid: name, name })]);
      });
      render(<App />);
      expect(await screen.findByText('Old Trending')).toBeInTheDocument();
      if (view === 'search') {
        await userEvent.type(screen.getByPlaceholderText(/search stations/i), 'jazz');
        expect(await screen.findByText('Jazz Nights')).toBeInTheDocument();
      } else if (view === 'empty results') {
        await userEvent.click(screen.getByRole('button', { name: /results/i }));
      }
      await userEvent.click(screen.getByRole('button', { name: /^trending$/i }));
      expect(await screen.findByText('Fresh Trending')).toBeInTheDocument();
      expect(screen.queryByText('Old Trending')).not.toBeInTheDocument();
      expect(screen.getByTestId('globe')).toHaveAttribute('data-stations', 'Fresh Trending');
    }
  );

  it('keeps a failed trending refresh visible and retries the current list', async () => {
    let refreshFailed = true;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (new URL(String(input)).searchParams.get('limit') === '200') {
        return createJsonResponse([createStation({ name: 'Old Trending' })]);
      }
      if (refreshFailed) throw new Error('Trending refresh failed');
      return createJsonResponse([createStation({ name: 'Fresh Trending' })]);
    });
    render(<App />);
    await screen.findByText('Old Trending');
    await userEvent.click(screen.getByRole('button', { name: /^trending$/i }));
    expect(await screen.findByText('Trending refresh failed')).toBeInTheDocument();
    expect(screen.getByText('Old Trending')).toBeInTheDocument();
    expect(screen.getByTestId('globe')).toHaveAttribute('data-stations', 'Old Trending');
    refreshFailed = false;
    await userEvent.click(screen.getByRole('button', { name: /refresh failed.*retry/i }));
    expect(await screen.findByText('Fresh Trending')).toBeInTheDocument();
  });

  it('keeps the interface available while initial station requests are pending', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => {}));
    render(<App />);
    expect(screen.getByRole('textbox', { name: 'Search stations' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show about dialog' }));
    const dialog = screen.getByRole('dialog', { name: 'About Explorer' });
    expect(within(dialog).getByRole('button', { name: 'Got it' })).toHaveFocus();
    await userEvent.keyboard('{Tab}');
    expect(within(dialog).getByRole('button', { name: 'Got it' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Show about dialog' })).toHaveFocus();
  });

  it('returns to play after failure and retries with a single click', async () => {
    playMock.mockRejectedValueOnce(new DOMException('Blocked', 'NotAllowedError'));
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      createJsonResponse([createStation()])
    );
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /test fm tl 128k/i }));
    const retry = await screen.findByRole('button', { name: 'Play station' });
    expect(playMock).toHaveBeenCalledTimes(1);
    await userEvent.click(retry);
    expect(await screen.findByRole('button', { name: 'Pause playback' })).toBeInTheDocument();
    expect(playMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/Autoplay was blocked by your browser/i)).not.toBeInTheDocument();
  });

  it('adds and removes a favorite while keeping sidebar, player, and favorites panel in sync', async () => {
    const station = createStation({ stationuuid: 'fav-1', name: 'Favorite FM' });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(createJsonResponse([station]));

    render(<App />);

    const stationButton = await screen.findByRole('button', { name: /favorite fm tl 128k/i });
    const addFavoriteButtons = screen.getAllByRole('button', { name: /add favorite/i });

    expect(screen.getByText(/No liked channels yet/i)).toBeInTheDocument();

    await userEvent.click(addFavoriteButtons[0]);

    expect(await screen.findAllByText('Favorite FM')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /remove favorite/i }).length).toBeGreaterThan(0);

    await userEvent.click(stationButton);

    expect((await screen.findAllByRole('button', { name: /remove favorite/i })).length).toBe(3);

    const playerRemoveFavoriteButton = screen.getAllByRole('button', {
      name: /remove favorite/i,
    })[0];
    await userEvent.click(playerRemoveFavoriteButton);

    expect(await screen.findByText(/No liked channels yet/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /add favorite/i })).toHaveLength(2);
  });

  it('restores favorites from localStorage after a refresh and lets the user reselect from favorites', async () => {
    const station = createStation({
      stationuuid: 'persist-1',
      name: 'Persist FM',
      country: 'Japan',
      countrycode: 'JP',
    });

    window.localStorage.setItem('radioExplorerFavorites', JSON.stringify([station]));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(createJsonResponse([station]));

    render(<App />);

    const favoriteEntry = await screen.findByRole('button', { name: /persist fm jp 128k live/i });
    expect(
      within(favoriteEntry.parentElement).getByRole('button', { name: /remove favorite/i })
    ).toBeInTheDocument();

    await userEvent.click(favoriteEntry);

    expect(await screen.findAllByRole('heading', { name: 'Persist FM' })).toHaveLength(3);
    expect(screen.getByText(/Japan/i)).toBeInTheDocument();
  });
});
