import { useCallback, useEffect, useRef, useState } from 'react';
import type { RadioStation } from '../types/radio';
import { getStationIdentity } from '../lib/favorites';
import {
  createListeningPassport,
  readListeningPassport,
  recordPassportListening,
  removeListeningPassport,
  writeListeningPassport,
} from '../lib/listeningPassport';

const FLUSH_INTERVAL = 5_000;

export function useListeningPassport() {
  const [passport, setPassport] = useState(readListeningPassport);
  const current = useRef(passport);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback((publish = true) => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    if (!dirty.current) return;
    dirty.current = false;
    writeListeningPassport(current.current);
    if (publish) setPassport(current.current);
  }, []);

  const recordListening = useCallback(
    (station: RadioStation, seconds: number) => {
      const before = current.current;
      const next = recordPassportListening(before, station, seconds);
      if (next === before) return;
      current.current = next;
      dirty.current = true;
      if (
        before.recent[0]?.id !== getStationIdentity(station) ||
        before.countries.length !== next.countries.length
      ) {
        flush();
      } else if (timer.current === null) {
        timer.current = setTimeout(() => flush(), FLUSH_INTERVAL);
      }
    },
    [flush]
  );

  const clearPassport = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    dirty.current = false;
    current.current = createListeningPassport();
    setPassport(current.current);
    removeListeningPassport();
  }, []);

  useEffect(() => {
    const flushHidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    const flushLeaving = () => flush();
    document.addEventListener('visibilitychange', flushHidden);
    window.addEventListener('pagehide', flushLeaving);
    window.addEventListener('beforeunload', flushLeaving);
    return () => {
      document.removeEventListener('visibilitychange', flushHidden);
      window.removeEventListener('pagehide', flushLeaving);
      window.removeEventListener('beforeunload', flushLeaving);
      flush(false);
    };
  }, [flush]);

  return { passport, recordListening, clearPassport };
}
