import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import * as THREE from 'three';
import type { GlobeProps } from 'react-globe.gl';
import Globe from './Globe';
import { createStation } from '../test/fixtures';

const captured = vi.hoisted(() => ({ props: null as GlobeProps | null }));
vi.mock('react-globe.gl', () => ({
  default: (props: GlobeProps) => {
    captured.props = props;
    return <div data-testid="globe-renderer" />;
  },
}));

describe('Globe material', () => {
  let requests: {
    url: string;
    texture: THREE.Texture;
    succeed: () => void;
    fail: () => void;
  }[];

  beforeEach(() => {
    vi.useFakeTimers();
    requests = [];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ features: [] })));
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(
      (url, onLoad, _progress, onError) => {
        const texture = new THREE.Texture(new Image());
        requests.push({
          url,
          texture,
          succeed: () => onLoad?.(texture),
          fail: () => onError?.(new Error('Offline')),
        });
        return texture;
      }
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const mount = async () => {
    const view = render(<Globe stations={[]} onSelectStation={() => undefined} />);
    await act(async () => {
      await Promise.resolve();
    });
    return { ...view, material: captured.props.globeMaterial as THREE.MeshPhongMaterial };
  };

  it('provides a visible material immediately and retains it when the texture fails', async () => {
    const { material } = await mount();
    expect(material).toBeInstanceOf(THREE.MeshPhongMaterial);
    expect(material.color.getHexString()).toBe('1d4ed8');
    act(() => requests[0].fail());
    expect(material.map).toBeNull();
    expect(material.emissiveIntensity).toBeGreaterThan(0);
    expect(material.color.getHexString()).toBe('1d4ed8');
  });

  it('keeps the daylight texture when the optional bump map fails', async () => {
    const { material } = await mount();
    expect(requests[0].url).toContain('earth-blue-marble');
    act(() => requests[0].succeed());
    expect(material.map).toBe(requests[0].texture);
    expect(material.map.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(material.color.getHexString()).toBe('ffffff');
    act(() => requests[1].fail());
    expect(material.map).toBe(requests[0].texture);
    expect(material.bumpMap).toBeNull();
  });

  it('adds the bump texture when both resources load', async () => {
    const { material } = await mount();
    act(() => requests[0].succeed());
    act(() => requests[1].succeed());
    expect(material.bumpMap).toBe(requests[1].texture);
    expect(material.bumpScale).toBe(10);
  });

  it('keeps the fallback if a texture arrives after timeout', async () => {
    const { material } = await mount();
    act(() => vi.advanceTimersByTime(8000));
    act(() => requests[0].succeed());
    expect(material.map).toBeNull();
    expect(material.color.getHexString()).toBe('1d4ed8');
    expect(requests).toHaveLength(1);
  });

  it('releases resources and ignores a texture callback after unmount', async () => {
    const { material, unmount } = await mount();
    const disposeTexture = vi.spyOn(requests[0].texture, 'dispose');
    const disposeMaterial = vi.spyOn(material, 'dispose');
    unmount();
    act(() => requests[0].succeed());
    expect(material.map).toBeNull();
    expect(disposeTexture).toHaveBeenCalled();
    expect(disposeMaterial).toHaveBeenCalled();
  });

  it('loads and plays stations outside the initial list when a country is clicked', async () => {
    const station = createStation({ stationuuid: 'country-only', name: 'Local French Radio' });
    vi.mocked(globalThis.fetch).mockImplementation(
      async (input) =>
        new Response(
          JSON.stringify(String(input).includes('radio-browser') ? [station] : { features: [] })
        )
    );
    const onSelectStation = vi.fn();
    render(<Globe stations={[]} onSelectStation={onSelectStation} />);
    act(() =>
      captured.props.onPolygonClick(
        { type: 'Feature', properties: { NAME_EN: 'France', ISO_A2: 'FR' } },
        new MouseEvent('click'),
        { lat: 48, lng: 2, altitude: 0 }
      )
    );
    expect(screen.getByRole('status')).toHaveTextContent('Loading stations for France');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    const panel = screen.getByRole('region', { name: 'France radio stations' });
    act(() =>
      captured.props.onPolygonHover(
        { type: 'Feature', properties: { NAME_EN: 'Germany', ISO_A2: 'DE' } },
        null
      )
    );
    expect(panel).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Germany radio stations' })
    ).not.toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: 'Local French Radio Play' }));
    expect(onSelectStation).toHaveBeenCalledWith(station);
    fireEvent.click(within(panel).getByRole('button', { name: 'Close country stations' }));
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });
});
