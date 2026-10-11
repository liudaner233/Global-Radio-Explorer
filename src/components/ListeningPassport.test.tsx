import { fireEvent, render, screen } from '@testing-library/react';
import { createStation } from '../test/fixtures';
import { createListeningPassport, recordPassportListening } from '../lib/listeningPassport';
import ListeningPassport from './ListeningPassport';

describe('listening passport panel', () => {
  it('shows an honest empty state before any audio has progressed', () => {
    render(
      <ListeningPassport
        passport={createListeningPassport()}
        onSelectStation={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(screen.getByText('Your first destination awaits')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Replay/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear passport' })).not.toBeInTheDocument();
  });

  it('displays real country and time records and replays the original station', () => {
    const station = createStation({ name: 'Paris FM', country: 'France', countrycode: 'FR' });
    const passport = recordPassportListening(createListeningPassport(), station, 65);
    const onSelectStation = vi.fn();
    render(
      <ListeningPassport passport={passport} onSelectStation={onSelectStation} onClear={vi.fn()} />
    );
    expect(screen.getByText('France')).toBeInTheDocument();
    expect(screen.getAllByText('1m 5s')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Replay Paris FM' }));
    expect(onSelectStation).toHaveBeenCalledWith(
      expect.objectContaining({ stationuuid: station.stationuuid })
    );
  });

  it('requires a second click to clear and allows cancellation', () => {
    const onClear = vi.fn();
    render(
      <ListeningPassport
        passport={recordPassportListening(createListeningPassport(), createStation(), 1)}
        onSelectStation={vi.fn()}
        onClear={onClear}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clear passport' }));
    expect(onClear).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel clearing passport' }));
    expect(onClear).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Clear passport' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear listening history' }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});
