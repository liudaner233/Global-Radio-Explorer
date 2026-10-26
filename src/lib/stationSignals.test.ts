import {
  BufferAttribute,
  BufferGeometry,
  Color,
  EventDispatcher,
  Mesh,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import { createStationSignals, hasStationSignal } from './stationSignals';
import { createStation } from '../test/fixtures';
import { getStationGenre } from './stationGenres';

describe('station signal eligibility', () => {
  const station = createStation({ geo_lat: 0, geo_long: 0 });

  it('accepts a healthy station at zero coordinates', () => {
    expect(hasStationSignal(station)).toBe(true);
  });

  it.each([null, NaN, Infinity, 91, -91])('rejects invalid latitude %s', (geo_lat) => {
    expect(hasStationSignal({ ...station, geo_lat })).toBe(false);
  });

  it.each([null, NaN, Infinity, 181, -181])('rejects invalid longitude %s', (geo_long) => {
    expect(hasStationSignal({ ...station, geo_long })).toBe(false);
  });

  it('requires a successful health check and a browser stream URL', () => {
    expect(hasStationSignal({ ...station, lastcheckok: 0 })).toBe(false);
    expect(hasStationSignal({ ...station, url_resolved: '', url: '' })).toBe(false);
    expect(hasStationSignal({ ...station, url_resolved: 'javascript:alert(1)' })).toBe(false);
    expect(hasStationSignal({ ...station, url_resolved: 'not a URL' })).toBe(false);
    expect(hasStationSignal({ ...station, url_resolved: '' })).toBe(true);
  });
});

describe('station signal scene', () => {
  let scene: Scene;
  let camera: PerspectiveCamera;
  let controls: EventDispatcher<{ change: object }>;
  let canvas: HTMLCanvasElement;
  let motion: MediaQueryList;
  let globe: GlobeMethods;
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;
  let time: number;
  let altitude: number;
  let signals: ReturnType<typeof createStationSignals> | null;

  const stations = [
    createStation({ stationuuid: 'north', geo_lat: 45, geo_long: 0, tags: 'rock,jazz' }),
    createStation({ stationuuid: 'east', geo_lat: 0, geo_long: 45, tags: 'pop' }),
    createStation({ stationuuid: 'south', geo_lat: -45, geo_long: 0, tags: 'unclassified' }),
  ];

  beforeEach(() => {
    scene = new Scene();
    camera = new PerspectiveCamera(60, 800 / 600, 0.05, 1000);
    camera.position.set(0, 0, 250);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    controls = new EventDispatcher();
    canvas = document.createElement('canvas');
    Object.defineProperties(canvas, {
      clientWidth: { value: 800 },
      clientHeight: { value: 600 },
    });
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 800, 600));
    motion = Object.assign(new EventTarget(), {
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
    }) as unknown as MediaQueryList;
    vi.stubGlobal('matchMedia', () => motion);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    frames = new Map();
    nextFrame = 0;
    time = 0;
    altitude = 1.45;
    signals = null;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        const id = ++nextFrame;
        frames.set(id, callback);
        return id;
      })
    );
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((id: number) => frames.delete(id))
    );
    globe = {
      scene: () => scene,
      camera: () => camera,
      controls: () => controls,
      renderer: () => ({ domElement: canvas, getPixelRatio: () => 1.5 }),
      getGlobeRadius: () => 100,
      pointOfView: () => ({ altitude }),
      getCoords: (latitude: number, longitude: number, altitude: number) => {
        const lat = (latitude * Math.PI) / 180;
        const lng = (longitude * Math.PI) / 180;
        const radius = 100 * (1 + altitude);
        return {
          x: radius * Math.cos(lat) * Math.sin(lng),
          y: radius * Math.sin(lat),
          z: radius * Math.cos(lat) * Math.cos(lng),
        };
      },
    } as unknown as GlobeMethods;
  });

  afterEach(() => {
    signals?.dispose();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function advanceFrames(count: number, step = 50) {
    for (let index = 0; index < count; index++) {
      time += step;
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(time));
    }
  }

  function getPoints() {
    return scene.getObjectByName('station-signals') as Points<BufferGeometry, ShaderMaterial>;
  }

  function getSweep() {
    return scene.getObjectByName('station-scan') as Mesh<BufferGeometry, ShaderMaterial>;
  }

  function expectColor(points: ReturnType<typeof getPoints>, index: number, hex: string) {
    const expected = new Color(hex).getRGB({ r: 0, g: 0, b: 0 }, SRGBColorSpace);
    const colors = points.geometry.getAttribute('signalColor');
    expect(colors.getX(index)).toBeCloseTo(expected.r, 4);
    expect(colors.getY(index)).toBeCloseTo(expected.g, 4);
    expect(colors.getZ(index)).toBeCloseTo(expected.b, 4);
  }

  it('colors real categories individually and emphasizes only matching stations', () => {
    signals = createStationSignals(globe, stations, vi.fn());
    const points = getPoints();
    expect(points).toBeInstanceOf(Points);
    expectColor(points, 0, getStationGenre('rock').color);
    expectColor(points, 1, getStationGenre('pop').color);
    expectColor(points, 2, getStationGenre('all').color);
    expect(Array.from(points.geometry.getAttribute('emphasis').array)).toEqual([1, 1, 1]);

    signals.updateGenre('jazz');
    expectColor(points, 0, getStationGenre('jazz').color);
    expectColor(points, 1, getStationGenre('pop').color);
    expectColor(points, 2, getStationGenre('all').color);
    const emphasis = points.geometry.getAttribute('emphasis');
    expect(emphasis.getX(0)).toBe(1);
    expect(emphasis.getX(1)).toBeCloseTo(0.28);
    expect(emphasis.getX(2)).toBeCloseTo(0.28);
  });

  it('preserves geometry and partially discovered signals when changing categories mid-scan', () => {
    signals = createStationSignals(globe, stations, vi.fn());
    const points = getPoints();
    const sweep = getSweep();
    const geometry = points.geometry;
    const positions = geometry.getAttribute('position');
    const discovered = geometry.getAttribute('discovered');
    const material = points.material;
    advanceFrames(5);
    expect(discovered.getX(0)).toBeLessThan(1000000);
    expect(discovered.getX(1)).toBe(1000000);
    const discoveryTimes = Array.from(discovered.array);
    const scanProgress = sweep.material.uniforms.progress.value;

    signals.updateGenre('jazz');
    expect(points.geometry).toBe(geometry);
    expect(points.geometry.getAttribute('position')).toBe(positions);
    expect(points.geometry.getAttribute('discovered')).toBe(discovered);
    expect(points.material).toBe(material);
    expect(Array.from(discovered.array)).toEqual(discoveryTimes);
    expect(sweep.material.uniforms.progress.value).toBe(scanProgress);
    expect(scene.children).toEqual([points, sweep]);

    advanceFrames(8);
    expect(discovered.getX(1)).toBeLessThan(1000000);
    expect(discovered.getX(2)).toBe(1000000);
    advanceFrames(30);
    expect(Array.from(discovered.array).every((value) => value < 1000000)).toBe(true);
    expect(sweep.visible).toBe(false);
    expect(points.geometry).toBe(geometry);
  });

  it('retains discovery by station identity and colors newly loaded stations', () => {
    signals = createStationSignals(globe, stations, vi.fn(), 'jazz');
    const points = getPoints();
    const sweep = getSweep();
    const oldGeometry = points.geometry;
    const oldDiscovery = oldGeometry.getAttribute('discovered');
    advanceFrames(5);
    const northDiscovered = oldDiscovery.getX(0);
    const disposeOldGeometry = vi.spyOn(oldGeometry, 'dispose');
    signals.updateStations([
      { ...stations[1], tags: 'rock' },
      createStation({ stationuuid: 'west', geo_lat: 0, geo_long: -45, tags: 'Hip-Hop' }),
      { ...stations[0], tags: 'jazz' },
    ]);
    expect(scene.children).toEqual([points, sweep]);
    expect(points.geometry).not.toBe(oldGeometry);
    expect(disposeOldGeometry).toHaveBeenCalledOnce();
    const discovery = points.geometry.getAttribute('discovered');
    expect(discovery.getX(2)).toBe(northDiscovered);
    expect(discovery.getX(0)).toBe(1000000);
    expect(discovery.getX(1)).toBe(1000000);
    expectColor(points, 0, getStationGenre('rock').color);
    expectColor(points, 1, getStationGenre('hip-hop').color);
    expectColor(points, 2, getStationGenre('jazz').color);

    advanceFrames(35);
    expect(discovery.getX(2)).toBe(northDiscovered);
    expect(discovery.getX(0)).toBeLessThan(1000000);
    expect(discovery.getX(1)).toBeLessThan(1000000);
  });

  it('reuses scan projections until the camera changes', () => {
    signals = createStationSignals(globe, stations, vi.fn());
    const project = vi.spyOn(Vector3.prototype, 'applyMatrix4');
    advanceFrames(1);
    expect(project).toHaveBeenCalledTimes(stations.length + 1);
    advanceFrames(5);
    expect(project).toHaveBeenCalledTimes(stations.length + 1);

    camera.position.set(100, 0, 250);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    controls.dispatchEvent({ type: 'change' });
    advanceFrames(1);
    expect(project.mock.calls.length).toBeGreaterThan(stations.length + 1);
    const projected = project.mock.calls.length;
    advanceFrames(2);
    expect(project).toHaveBeenCalledTimes(projected);
  });

  it('uploads discovery attributes only when another signal is revealed', () => {
    signals = createStationSignals(globe, stations, vi.fn());
    const discovered = getPoints().geometry.getAttribute('discovered') as BufferAttribute;
    advanceFrames(1);
    const firstVersion = discovered.version;
    advanceFrames(5);
    expect(discovered.version).toBe(firstVersion);
    advanceFrames(8);
    expect(discovered.version).toBeGreaterThan(firstVersion);
  });

  it('projects a 6000-station catalog once during a stationary scan', () => {
    const catalog = Array.from({ length: 6000 }, (_, index) =>
      createStation({
        stationuuid: `station-${index}`,
        geo_lat: (index % 170) - 85,
        geo_long: (index % 360) - 180,
      })
    );
    signals = createStationSignals(globe, catalog, vi.fn());
    const project = vi.spyOn(Vector3.prototype, 'applyMatrix4');
    advanceFrames(40);
    expect(project).toHaveBeenCalledTimes(catalog.length + 1);
    expect(getSweep().visible).toBe(false);
    expect(
      Array.from(getPoints().geometry.getAttribute('discovered').array).every(
        (value) => value < 1000000
      )
    ).toBe(true);
    advanceFrames(30);
    expect(project).toHaveBeenCalledTimes(catalog.length + 1);
  });

  it('limits settled pulse uniform updates to 30 Hz while retaining continuous animation', () => {
    signals = createStationSignals(globe, stations, vi.fn());
    advanceFrames(40);
    const clock = getPoints().material.uniforms.time;
    let updates = 0;
    for (let index = 0; index < 60; index++) {
      const previous = clock.value;
      advanceFrames(1, 1000 / 60);
      if (clock.value !== previous) updates++;
    }
    expect(updates).toBeGreaterThanOrEqual(20);
    expect(updates).toBeLessThanOrEqual(30);
    expect(frames.size).toBe(1);
  });

  it('reuses point geometry when station metadata changes without moving locations', () => {
    signals = createStationSignals(globe, stations, vi.fn());
    const points = getPoints();
    const geometry = points.geometry;
    const positions = geometry.getAttribute('position') as BufferAttribute;
    const colors = geometry.getAttribute('signalColor') as BufferAttribute;
    const positionVersion = positions.version;
    const colorVersion = colors.version;
    advanceFrames(5);
    const discovered = Array.from(geometry.getAttribute('discovered').array);
    signals.updateStations(stations.map((station) => ({ ...station, votes: station.votes + 1 })));
    expect(points.geometry).toBe(geometry);
    expect(positions.version).toBe(positionVersion);
    expect(colors.version).toBe(colorVersion);
    expect(Array.from(geometry.getAttribute('discovered').array)).toEqual(discovered);

    signals.updateStations(stations.map((station) => ({ ...station, tags: 'pop' })));
    expect(points.geometry).toBe(geometry);
    expect(colors.version).toBeGreaterThan(colorVersion);
    expectColor(points, 0, getStationGenre('pop').color);
  });

  it('stops all animation callbacks while hidden or when reduced motion is requested', () => {
    signals = createStationSignals(globe, stations, vi.fn());
    advanceFrames(5);
    const progress = getSweep().material.uniforms.progress.value;
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(frames.size).toBe(0);
    advanceFrames(10);
    expect(getSweep().material.uniforms.progress.value).toBe(progress);

    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(frames.size).toBe(1);
    Object.defineProperty(motion, 'matches', { value: true, configurable: true });
    motion.dispatchEvent(new Event('change'));
    expect(frames.size).toBe(0);
    expect(getSweep().visible).toBe(false);
    expect(getPoints().material.uniforms.still.value).toBe(1);
    expect(
      Array.from(getPoints().geometry.getAttribute('discovered').array).every(
        (value) => value < 1000000
      )
    ).toBe(true);
    signals.startScan();
    expect(frames.size).toBe(0);
    expect(getSweep().visible).toBe(false);
  });

  it('keeps nonmatching signals clickable after changing the active category', () => {
    const onSelect = vi.fn();
    signals = createStationSignals(globe, stations, onSelect);
    advanceFrames(40);
    signals.updateGenre('jazz');
    const position = new Vector3().fromBufferAttribute(
      getPoints().geometry.getAttribute('position'),
      1
    );
    position.project(camera);
    const pointer = {
      clientX: ((position.x + 1) * canvas.clientWidth) / 2,
      clientY: ((1 - position.y) * canvas.clientHeight) / 2,
      isPrimary: true,
      button: 0,
    };
    canvas.dispatchEvent(new PointerEvent('pointerdown', pointer));
    const event = new PointerEvent('pointerup', pointer);
    canvas.dispatchEvent(event);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(stations[1], event);
  });

  it('releases Three resources and detaches animation and interaction listeners', () => {
    const removeCanvasListener = vi.spyOn(canvas, 'removeEventListener');
    const removeDocumentListener = vi.spyOn(document, 'removeEventListener');
    const removeMotionListener = vi.spyOn(motion, 'removeEventListener');
    const removeControlsListener = vi.spyOn(controls, 'removeEventListener');
    signals = createStationSignals(globe, stations, vi.fn());
    const points = getPoints();
    const sweep = getSweep();
    const disposals = [points.geometry, points.material, sweep.geometry, sweep.material].map(
      (resource) => vi.spyOn(resource, 'dispose')
    );
    expect(frames.size).toBe(1);
    signals.dispose();
    signals = null;
    expect(scene.children).toHaveLength(0);
    expect(frames.size).toBe(0);
    disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    for (const type of ['pointerdown', 'pointermove', 'pointerup']) {
      expect(removeCanvasListener).toHaveBeenCalledWith(type, expect.any(Function));
    }
    expect(removeDocumentListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(removeMotionListener).toHaveBeenCalledWith('change', expect.any(Function));
    expect(removeControlsListener).toHaveBeenCalledWith('change', expect.any(Function));
    const positions = points.geometry.getAttribute('position') as BufferAttribute;
    const positionVersion = positions.version;
    altitude = 0.1;
    controls.dispatchEvent({ type: 'change' });
    document.dispatchEvent(new Event('visibilitychange'));
    motion.dispatchEvent(new Event('change'));
    expect(frames.size).toBe(0);
    expect(positions.version).toBe(positionVersion);
  });
});
