import {
  Mesh,
  Group,
  MeshPhongMaterial,
  SphereGeometry,
  type Object3D,
  type MeshLambertMaterial,
} from 'three';
import type { GlobeMethods } from 'react-globe.gl';

type TileMesh = Mesh<SphereGeometry, MeshLambertMaterial>;
type TileEngine = Group & { level: number; tileUrl: unknown };

export function getDetailBlend(altitude: number) {
  const progress = Math.max(0, Math.min(1, (0.65 - altitude) / 0.24));
  return progress * progress * (3 - 2 * progress);
}

export function createDetailMapLayer(
  globe: GlobeMethods,
  source: MeshPhongMaterial,
  blend = { value: 0 }
) {
  const scene = globe.scene();
  const material = source.clone();
  const geometry = new SphereGeometry(globe.getGlobeRadius() * 0.995, 256, 128);
  const surface = new Mesh(geometry, material);
  surface.name = 'detail-map-fallback';
  surface.rotation.y = -Math.PI / 2;
  surface.renderOrder = -1;
  surface.visible = false;
  surface.raycast = () => {};
  surface.onBeforeRender = () => {
    if (material.map !== source.map || material.bumpMap !== source.bumpMap) {
      material.copy(source);
      material.needsUpdate = true;
    }
  };
  scene.add(surface);
  let engine: TileEngine | undefined;
  scene.traverse((object) => {
    if (
      object instanceof Group &&
      'tileUrl' in object &&
      'level' in object &&
      'curvatureResolution' in object
    )
      engine = object as TileEngine;
  });
  const tiles = new Map<TileMesh, number>();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let enabled = false;
  let frame = 0;
  let lastTime = 0;

  function update(time: number) {
    frame = 0;
    const target = enabled ? getDetailBlend(globe.pointOfView().altitude) : 0;
    const dt = lastTime ? Math.min(time - lastTime, 64) : 16;
    lastTime = time;
    blend.value = reduced.matches
      ? target
      : blend.value + (target - blend.value) * (1 - Math.exp(-dt / 85));
    if (Math.abs(target - blend.value) < 0.001) blend.value = target;
    let pending = blend.value !== target;
    for (const [tile, started] of tiles) {
      const fade = reduced.matches ? 1 : Math.min(1, (time - started) / 240);
      tile.material.opacity = Math.max(0, fade) * blend.value;
      if (enabled && fade < 1) pending = true;
    }
    if (pending && !document.hidden) frame = requestAnimationFrame(update);
  }
  function queue() {
    if (!frame && !document.hidden) frame = requestAnimationFrame(update);
  }
  function addTile(object: Object3D) {
    if (!(object instanceof Mesh) || !object.material.map) return;
    const tile = object as TileMesh;
    const level = Math.round(Math.log2((2 * Math.PI) / tile.geometry.parameters.phiLength));
    tile.renderOrder = -0.5 + level * 0.01;
    tile.material.transparent = true;
    tile.material.depthWrite = false;
    tile.material.opacity = 0;
    tile.material.needsUpdate = true;
    tile.onBeforeRender = () => {
      tile.material.depthWrite = false;
    };
    tiles.set(tile, performance.now());
    queue();
  }
  function added(event: { child: Object3D }) {
    addTile(event.child);
  }
  function removed(event: { child: Object3D }) {
    tiles.delete(event.child as TileMesh);
  }
  function visibility() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
    if (!document.hidden) queue();
  }
  engine?.children.forEach(addTile);
  engine?.addEventListener('childadded', added);
  engine?.addEventListener('childremoved', removed);
  globe.controls().addEventListener('change', queue);
  document.addEventListener('visibilitychange', visibility);
  reduced.addEventListener('change', queue);
  return {
    blend,
    setEnabled(value: boolean) {
      enabled = value;
      surface.visible = value;
      if (!value) blend.value = 0;
      queue();
    },
    dispose() {
      cancelAnimationFrame(frame);
      engine?.removeEventListener('childadded', added);
      engine?.removeEventListener('childremoved', removed);
      globe.controls().removeEventListener('change', queue);
      document.removeEventListener('visibilitychange', visibility);
      reduced.removeEventListener('change', queue);
      tiles.forEach((_started, tile) => {
        tile.onBeforeRender = () => {};
      });
      tiles.clear();
      scene.remove(surface);
      geometry.dispose();
      material.dispose();
    },
  };
}
