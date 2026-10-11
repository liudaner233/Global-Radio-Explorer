import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStation } from '../test/fixtures';
import type { RadioStation } from '../types/radio';
import DiscoveryPanel from './DiscoveryPanel';

const stations = [
  createStation({
    stationuuid: 'ambient',
    name: 'Quiet Air',
    tags: 'ambient,instrumental',
    country: 'France',
    countrycode: 'FR',
    geo_lat: 0,
    geo_long: 0,
  }),
  createStation({
    stationuuid: 'dance',
    name: 'Night Dance',
    tags: 'dance,house',
    country: 'Germany',
    countrycode: 'DE',
    geo_lat: 0,
    geo_long: 10,
  }),
  createStation({
    stationuuid: 'jazz',
    name: 'City Jazz',
    tags: 'smooth jazz',
    country: 'Japan',
    countrycode: 'JP',
    geo_lat: 35,
    geo_long: 139,
  }),
  createStation({
    stationuuid: 'offline',
    name: 'Offline Radio',
    tags: 'ambient',
    country: 'France',
    geo_lat: 0,
    geo_long: 0,
    lastcheckok: 0,
  }),
];

function setup(
  overrides: Partial<
    Omit<ComponentProps<typeof DiscoveryPanel>, 'onSelectStation' | 'onStartJourney'>
  > = {}
) {
  const props = {
    stations,
    genre: 'all' as const,
    selectedStation: null,
    onSelectStation: vi.fn<(station: RadioStation) => void>(),
    onStartJourney: vi.fn<(route: RadioStation[]) => void>(),
    ...overrides,
  };
  return { ...render(<DiscoveryPanel {...props} />), props };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('DiscoveryPanel', () => {
  it('shows real country/tag reasons, filters by mood, and plays through the supplied callback', () => {
    const { props } = setup();
    expect(screen.queryByRole('button', { name: 'Play Offline Radio' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Focus' }));
    expect(screen.getByRole('button', { name: 'Play Quiet Air' })).toHaveTextContent(
      'France · Tagged ambient / instrumental'
    );
    expect(screen.queryByRole('button', { name: 'Play Night Dance' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Play Quiet Air' }));
    expect(props.onSelectStation).toHaveBeenCalledWith(stations[0]);
  });

  it('supplies only matching real stations when starting a journey and handles missing matches', () => {
    const { props } = setup({ genre: 'dance' });
    fireEvent.click(screen.getByRole('button', { name: 'Start journey' }));
    expect(props.onStartJourney).toHaveBeenCalledWith([stations[1]]);
    fireEvent.click(screen.getByRole('button', { name: 'Focus' }));
    expect(screen.getByText(/No loaded signals match/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Surprise me' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reset discovery filters' }));
    expect(screen.getByRole('button', { name: 'Play Night Dance' })).toBeVisible();
    expect(screen.getByText('Dance')).toBeVisible();
  });

  it('does not repeat surprise selections until the available set is exhausted', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { props } = setup();
    const button = screen.getByRole('button', { name: 'Surprise me' });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    const picked = props.onSelectStation.mock.calls.map(
      ([station]: [RadioStation]) => station.stationuuid
    );
    expect(new Set(picked).size).toBe(3);
  });

  it('refreshes geographic sunrise results when time changes and the page becomes visible', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T06:00:00Z'));
    setup({ stations: [stations[0]] });
    fireEvent.click(screen.getByRole('button', { name: 'Sunrise' }));
    expect(screen.getByRole('button', { name: 'Play Quiet Air' })).toHaveTextContent(
      'Sunrise band'
    );
    vi.setSystemTime(new Date('2026-03-20T18:00:00Z'));
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(screen.queryByRole('button', { name: 'Play Quiet Air' })).not.toBeInTheDocument();
    expect(screen.getByText(/No loaded signals match/)).toBeVisible();
  });

  it('keeps existing candidates playable while more signals load and cleans up its timer', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T00:00:00Z'));
    const { unmount } = setup({ loading: true });
    expect(screen.getByRole('button', { name: 'Play Quiet Air' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'After dark' }));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('pauses daylight updates when inactive and refreshes on return without resetting filters', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T06:00:00Z'));
    const { props, rerender, unmount } = setup({ stations: [stations[0]], active: true });
    fireEvent.click(screen.getByRole('button', { name: 'Focus' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sunrise' }));
    expect(screen.getByRole('button', { name: 'Play Quiet Air' })).toHaveTextContent(
      'Sunrise band'
    );
    expect(vi.getTimerCount()).toBe(1);
    rerender(<DiscoveryPanel {...props} active={false} />);
    expect(vi.getTimerCount()).toBe(0);
    vi.setSystemTime(new Date('2026-03-20T18:00:00Z'));
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(screen.getByRole('button', { name: 'Play Quiet Air' })).toBeInTheDocument();
    rerender(<DiscoveryPanel {...props} active />);
    expect(vi.getTimerCount()).toBe(1);
    expect(screen.getByRole('button', { name: 'Focus' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Sunrise' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Play Quiet Air' })).not.toBeInTheDocument();
    vi.setSystemTime(new Date('2026-03-21T06:00:00Z'));
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByRole('button', { name: 'Play Quiet Air' })).toHaveTextContent(
      'Sunrise band'
    );
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves discovery choices and surprise history while mounted but inactive', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T06:00:00Z'));
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const second = createStation({
      ...stations[0],
      stationuuid: 'ambient-second',
      name: 'Quiet Coast',
      country: 'Portugal',
      countrycode: 'PT',
    });
    const { props, rerender } = setup({ stations: [stations[0], second], active: true });
    fireEvent.click(screen.getByRole('button', { name: 'Focus' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sunrise' }));
    fireEvent.click(screen.getByRole('button', { name: 'Surprise me' }));
    expect(props.onSelectStation).toHaveBeenCalledTimes(1);
    const firstId = props.onSelectStation.mock.calls[0][0].stationuuid;
    rerender(<DiscoveryPanel {...props} active={false} />);
    expect(vi.getTimerCount()).toBe(0);
    rerender(<DiscoveryPanel {...props} active />);
    expect(screen.getByRole('button', { name: 'Focus' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Sunrise' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Surprise me' }));
    expect(props.onSelectStation).toHaveBeenCalledTimes(2);
    expect(props.onSelectStation.mock.calls[1][0].stationuuid).not.toBe(firstId);
  });

  it('shows an honest loading state while there are no eligible real signals', () => {
    setup({ stations: [], loading: true });
    expect(screen.getByRole('status')).toHaveTextContent('Finding live signals');
    expect(screen.getByRole('button', { name: 'Start journey' })).toBeDisabled();
  });
});
