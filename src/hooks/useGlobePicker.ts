import { useEffect, useState, type RefObject } from 'react';
import type { GlobeMethods } from 'react-globe.gl';
import { Vector3 } from 'three';
import type { RadioStation } from '../types/radio';
import { getStationIdentity } from '../lib/favorites';
import { getSurfaceAltitude } from '../lib/globeView';

export function useGlobePicker(
  globeRef: RefObject<GlobeMethods | undefined>,
  ready: boolean,
  stations: RadioStation[]
) {
  const [station, setStation] = useState<RadioStation | null>(null);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    const globe = globeRef.current;
    if (!ready || !globe) return;
    const cameraPosition = new Vector3();
    const projected = new Vector3();
    const locations = stations.map((candidate) => {
      const coords = globe.getCoords(candidate.geo_lat!, candidate.geo_long!);
      return new Vector3(coords.x, coords.y, coords.z);
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controls = globe.controls();
    function update() {
      timer = undefined;
      const globe = globeRef.current!;
      const canvas = globe.renderer().domElement;
      const camera = globe.camera();
      camera.getWorldPosition(cameraPosition);
      const surface = getSurfaceAltitude(globe.pointOfView().altitude);
      let nearest = 40;
      let match: RadioStation | null = null;
      const horizon = globe.getGlobeRadius() ** 2 / (1 + surface);
      for (let index = 0; index < stations.length; index++) {
        if (locations[index].dot(cameraPosition) <= horizon) continue;
        projected
          .copy(locations[index])
          .multiplyScalar(1 + surface)
          .project(camera);
        const distance = Math.hypot(
          (projected.x * canvas.clientWidth) / 2,
          (projected.y * canvas.clientHeight) / 2
        );
        if (distance < nearest) {
          nearest = distance;
          match = stations[index];
        }
      }
      setStation((previous) =>
        getStationIdentity(previous) === getStationIdentity(match) && previous === match
          ? previous
          : match
      );
    }
    function queue() {
      if (!timer) timer = setTimeout(update, 80);
    }
    function start() {
      setMoving(true);
    }
    function end() {
      setMoving(false);
      queue();
    }
    controls.addEventListener('change', queue);
    controls.addEventListener('start', start);
    controls.addEventListener('end', end);
    window.addEventListener('resize', queue);
    update();
    return () => {
      clearTimeout(timer);
      controls.removeEventListener('change', queue);
      controls.removeEventListener('start', start);
      controls.removeEventListener('end', end);
      window.removeEventListener('resize', queue);
    };
  }, [globeRef, ready, stations]);

  return { station, moving };
}
