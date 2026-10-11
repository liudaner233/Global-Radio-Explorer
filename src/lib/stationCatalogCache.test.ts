import { createStation } from '../test/fixtures';
import { readCatalogCache, saveCatalogCache } from './stationCatalogCache';

describe('startup catalog cache', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('expires old snapshots and rejects malformed data', () => {
    localStorage.setItem(
      'radioExplorerCatalog',
      JSON.stringify({ time: Date.now() - 31 * 60 * 1000, stations: [createStation()] })
    );
    expect(readCatalogCache()).toBeNull();
    localStorage.setItem(
      'radioExplorerCatalog',
      JSON.stringify({ time: Date.now(), stations: [null, 12] })
    );
    expect(readCatalogCache()).toBeNull();
    localStorage.setItem('radioExplorerCatalog', '{');
    expect(readCatalogCache()).toBeNull();
  });

  it('deduplicates valid stations and survives unavailable storage', () => {
    saveCatalogCache([createStation(), createStation()]);
    expect(readCatalogCache()?.stations).toHaveLength(1);
    const blocked = () => {
      throw new DOMException('Blocked', 'SecurityError');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked });
    expect(readCatalogCache()).toBeNull();
    expect(() => saveCatalogCache([])).not.toThrow();
  });
});
