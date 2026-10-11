import { useEffect, useRef, useState } from 'react';
import type { GlobeMethods } from 'react-globe.gl';
import { AmbientLight, DirectionalLight, PerspectiveCamera } from 'three';
import {
  DETAIL_ALTITUDE,
  INITIAL_VIEW,
  MAX_ALTITUDE,
  MIN_ALTITUDE,
  getZoomAltitude,
} from '../lib/globeView';
import type { RadioStation } from '../types/radio';

function clampZoom(globe: GlobeMethods) {
  const view = globe.pointOfView();
  if (view.altitude > MAX_ALTITUDE) globe.pointOfView({ ...view, altitude: MAX_ALTITUDE }, 200);
}

function stopRotation(globe: GlobeMethods) {
  const controls = globe.controls();
  controls.autoRotate = false;
  const damping = controls.enableDamping;
  controls.enableDamping = false;
  controls.update();
  controls.enableDamping = damping;
}

export function useGlobeControls(selectedStation?: RadioStation | null, journeyActive = false) {
  const ref = useRef<GlobeMethods | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    function resize() {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
      if (ref.current) clampZoom(ref.current);
    }
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    const globe = ref.current;
    if (!ready || !globe) return;
    const controls = globe.controls();
    const scene = globe.scene();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let rotationTimer: ReturnType<typeof setTimeout>;
    globe.pointOfView(INITIAL_VIEW, 250);
    controls.autoRotate = !reduced.matches;
    controls.autoRotateSpeed = 0.35;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = globe.getGlobeRadius() * (1 + MIN_ALTITUDE);
    controls.maxDistance = globe.getGlobeRadius() * (1 + MAX_ALTITUDE);
    controls.zoomSpeed = 0.8;
    const camera = globe.camera();
    if (camera instanceof PerspectiveCamera) {
      camera.near = 0.05;
      camera.updateProjectionMatrix();
    }
    controls.target.set(0, 0, 0);
    controls.update();

    function pauseRotation() {
      clearTimeout(rotationTimer);
      controls.autoRotate = false;
    }
    function resumeRotation() {
      clearTimeout(rotationTimer);
      rotationTimer = setTimeout(() => {
        controls.autoRotate =
          !reduced.matches && !document.hidden && globe.pointOfView().altitude > DETAIL_ALTITUDE;
      }, 1400);
      clampZoom(globe);
    }

    function setResolution() {
      const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
      const limited =
        matchMedia('(pointer: coarse)').matches ||
        memory <= 4 ||
        navigator.hardwareConcurrency <= 4;
      globe!
        .renderer()
        .setPixelRatio(Math.min(window.devicePixelRatio || 1, limited ? 1.25 : 1.75));
    }
    function visibility() {
      clearTimeout(rotationTimer);
      if (document.hidden) globe!.pauseAnimation();
      else globe!.resumeAnimation();
    }
    function motionPreference() {
      if (reduced.matches) pauseRotation();
    }
    setResolution();
    visibility();

    const ambient = new AmbientLight(0xffffff, 0.6);
    const directional = new DirectionalLight(0xffffff, 0.8);
    directional.position.set(120, 80, 140);
    scene.add(ambient, directional);
    controls.addEventListener('start', pauseRotation);
    controls.addEventListener('end', resumeRotation);
    window.addEventListener('resize', setResolution);
    document.addEventListener('visibilitychange', visibility);
    reduced.addEventListener('change', motionPreference);

    return () => {
      clearTimeout(rotationTimer);
      controls.removeEventListener('start', pauseRotation);
      controls.removeEventListener('end', resumeRotation);
      window.removeEventListener('resize', setResolution);
      document.removeEventListener('visibilitychange', visibility);
      reduced.removeEventListener('change', motionPreference);
      scene.remove(ambient, directional);
    };
  }, [ready]);

  const latitude = selectedStation?.geo_lat;
  const longitude = selectedStation?.geo_long;

  useEffect(() => {
    if (ready && latitude != null && longitude != null) {
      const globe = ref.current;
      if (globe) stopRotation(globe);
      globe?.pointOfView(
        {
          lat: latitude,
          lng: longitude,
          altitude: journeyActive ? 1.35 : Math.min(globe.pointOfView().altitude, 0.22),
        },
        700
      );
    }
  }, [ready, latitude, longitude, journeyActive]);

  function zoom(direction: 'in' | 'out') {
    const globe = ref.current;
    if (!globe) return;
    stopRotation(globe);
    globe.pointOfView({ altitude: getZoomAltitude(globe.pointOfView().altitude, direction) }, 300);
  }

  function resetView() {
    const globe = ref.current;
    if (!globe) return;
    stopRotation(globe);
    globe.pointOfView(INITIAL_VIEW, 650);
  }

  return { ref, dimensions, ready, zoom, resetView, onReady: () => setReady(true) };
}
