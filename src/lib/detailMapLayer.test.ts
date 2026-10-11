import {
  Group,
  Mesh,
  MeshLambertMaterial,
  MeshPhongMaterial,
  Scene,
  SphereGeometry,
  Texture,
  EventDispatcher,
} from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import { createDetailMapLayer } from './detailMapLayer';

describe('map surface layers', () => {
  it('keeps the fallback beneath tiles and prevents depth collisions during LOD changes', () => {
    const scene = new Scene();
    const engine = Object.assign(new Group(), { tileUrl: null, level: 4, curvatureResolution: 2 });
    const controls = new EventDispatcher<{ change: object }>();
    scene.add(engine);
    const globe = {
      scene: () => scene,
      controls: () => controls,
      getGlobeRadius: () => 100,
      pointOfView: () => ({ altitude: 0.2 }),
    } as unknown as GlobeMethods;
    const controller = createDetailMapLayer(globe, new MeshPhongMaterial());
    controller.setEnabled(true);
    const parent = new Mesh(
      new SphereGeometry(100, 3, 1, 0, Math.PI / 8),
      new MeshLambertMaterial({ map: new Texture() })
    );
    const child = new Mesh(
      new SphereGeometry(100, 3, 1, 0, Math.PI / 16),
      new MeshLambertMaterial({ map: new Texture() })
    );
    engine.add(parent, child);
    const fallback = scene.getObjectByName('detail-map-fallback') as Mesh<SphereGeometry>;
    expect(fallback.geometry.parameters.radius).toBeLessThan(99.9);
    expect(parent.material.transparent).toBe(true);
    expect(parent.material.depthWrite).toBe(false);
    expect(child.renderOrder).toBeGreaterThan(parent.renderOrder);
    expect(child.material.opacity).toBe(0);
    child.material.depthWrite = true;
    child.onBeforeRender(null!, null!, null!, null!, null!, null!);
    expect(child.material.depthWrite).toBe(false);
    controller.dispose();
    expect(scene.getObjectByName('detail-map-fallback')).toBeUndefined();
    engine.remove(parent, child);
    parent.geometry.dispose();
    child.geometry.dispose();
    parent.material.map?.dispose();
    child.material.map?.dispose();
    parent.material.dispose();
    child.material.dispose();
  });
});
