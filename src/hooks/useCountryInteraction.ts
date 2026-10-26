import { useEffect, useRef, type RefObject } from 'react';
import { Raycaster, Sphere, Vector2, Vector3 } from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import { getCountryAtLocation, type CountryFeature } from '../lib/countries';

export function useCountryInteraction(
  globeRef: RefObject<GlobeMethods | undefined>,
  ready: boolean,
  countries: CountryFeature[],
  onHover: (country: CountryFeature | null) => void,
  onSelect: (country: CountryFeature, event: PointerEvent) => void
) {
  const handlers = useRef({ onHover, onSelect });
  useEffect(() => {
    handlers.current = { onHover, onSelect };
  }, [onHover, onSelect]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!ready || !globe || !countries.length) return;
    const canvas = globe.renderer().domElement;
    const controls = globe.controls();
    const raycaster = new Raycaster();
    const sphere = new Sphere(new Vector3(), globe.getGlobeRadius());
    const pointer = new Vector2();
    const position = new Vector3();
    let x = 0;
    let y = 0;
    let downX = 0;
    let downY = 0;
    let pressed = false;
    let inside = false;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function locate(clientX: number, clientY: number) {
      const bounds = canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return null;
      pointer.set(
        ((clientX - bounds.left) / bounds.width) * 2 - 1,
        1 - ((clientY - bounds.top) / bounds.height) * 2
      );
      raycaster.setFromCamera(pointer, globe!.camera());
      if (!raycaster.ray.intersectSphere(sphere, position)) return null;
      const { lat, lng } = globe!.toGeoCoords(position);
      return getCountryAtLocation(countries, lat, lng) ?? null;
    }

    function update() {
      timer = undefined;
      if (inside && !pressed && !document.hidden) handlers.current.onHover(locate(x, y));
    }

    function queue() {
      if (inside && !pressed && timer === undefined && !document.hidden)
        timer = setTimeout(update, 100);
    }

    function move(event: PointerEvent) {
      x = event.clientX;
      y = event.clientY;
      inside = true;
      if (event.pointerType !== 'touch') queue();
    }

    function leave() {
      inside = false;
      clearTimeout(timer);
      timer = undefined;
      handlers.current.onHover(null);
    }

    function down(event: PointerEvent) {
      if (event.button !== 0) return;
      pressed = true;
      downX = event.clientX;
      downY = event.clientY;
      clearTimeout(timer);
      timer = undefined;
    }

    function up(event: PointerEvent) {
      if (!pressed || event.button !== 0) return;
      pressed = false;
      x = event.clientX;
      y = event.clientY;
      const dragged = (x - downX) ** 2 + (y - downY) ** 2 > 36;
      if (!dragged) {
        const country = locate(x, y);
        if (country) queueMicrotask(() => active && handlers.current.onSelect(country, event));
      }
      queue();
    }

    function cancel() {
      pressed = false;
      leave();
    }

    function visibility() {
      clearTimeout(timer);
      timer = undefined;
      if (!document.hidden) queue();
    }

    canvas.addEventListener('pointermove', move, { passive: true });
    canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('pointerdown', down, { passive: true });
    canvas.addEventListener('pointerup', up, { passive: true });
    canvas.addEventListener('pointercancel', cancel);
    controls.addEventListener('change', queue);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      active = false;
      clearTimeout(timer);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', cancel);
      controls.removeEventListener('change', queue);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [globeRef, ready, countries]);
}
