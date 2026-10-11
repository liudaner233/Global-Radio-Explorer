import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { GlobeMethods } from 'react-globe.gl';
import { MeshPhongMaterial } from 'three';
import { getCenterTile, getMapTileUrl } from '../lib/globeView';
import { createDetailMapLayer } from '../lib/detailMapLayer';

export function useDetailMap(
  globeRef: RefObject<GlobeMethods | undefined>,
  ready: boolean,
  detailed: boolean,
  material: MeshPhongMaterial
) {
  const [available, setAvailable] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const layer = useRef<ReturnType<typeof createDetailMapLayer> | null>(null);
  const blend = useRef({ value: 0 });

  useEffect(() => {
    const globe = globeRef.current;
    if (!ready || !globe) return;
    const controller = createDetailMapLayer(globe, material, blend.current);
    layer.current = controller;
    return () => {
      controller.dispose();
      layer.current = null;
    };
  }, [globeRef, ready, material]);

  useLayoutEffect(() => {
    layer.current?.setEnabled(detailed && available);
  }, [detailed, available]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!ready || !detailed || !globe || available) return;
    let active = true;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    const view = globe.pointOfView();
    const tile = getCenterTile(view.lat, view.lng, view.altitude);
    const timer = setTimeout(() => {
      if (active) setFailed(true);
      active = false;
    }, 8000);
    image.onload = () => {
      if (!active) return;
      clearTimeout(timer);
      setFailed(false);
      setAvailable(true);
    };
    image.onerror = () => {
      if (!active) return;
      clearTimeout(timer);
      setFailed(true);
    };
    image.src = getMapTileUrl(tile.x, tile.y, tile.level);
    return () => {
      active = false;
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      image.removeAttribute('src');
    };
  }, [globeRef, ready, detailed, available, attempt]);

  return {
    blend: blend.current,
    tileUrl: detailed && available ? getMapTileUrl : null,
    failed: detailed && failed,
    retry: () => {
      setFailed(false);
      setAttempt((value) => value + 1);
    },
  };
}
