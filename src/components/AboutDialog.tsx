import { Globe as GlobeIcon } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

export default function AboutDialog({
  open,
  onClose,
  returnFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useLayoutEffect(() => {
    if (!open) return;
    const previous = returnFocusRef?.current || (document.activeElement as HTMLElement | null);
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const items = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, a[href], input, select, textarea, [tabindex="0"]'
      );
      if (!items?.length) return;
      const first = items[0],
        last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      queueMicrotask(() => {
        if (previous?.isConnected && !previous.closest('[inert]'))
          previous.focus({ preventScroll: true });
      });
    };
  }, [open, returnFocusRef]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-title"
            initial={{ scale: reduceMotion ? 1 : 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: reduceMotion ? 1 : 0.9, opacity: 0 }}
            className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl"
          >
            <div className="mb-6 flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600">
                <GlobeIcon className="h-7 w-7 text-white" />
              </div>
              <div>
                <h2 id="about-title" className="text-2xl font-bold">
                  About Explorer
                </h2>
                <p className="text-sm text-zinc-500">v1.0.0 • Open Source</p>
              </div>
            </div>

            <div className="mb-8 space-y-4 leading-relaxed text-zinc-400">
              <p>
                Welcome to Global Radio Explorer. Discover and stream thousands of stations from
                across the planet.
              </p>
              <p>
                Rotate the globe and click a marker to tune in, or use the sidebar to search by
                station name.
              </p>
              <div className="border-t border-zinc-800 pt-4">
                <p className="mb-3 text-xs">
                  Press / to search · Space to pause or resume. Nearby follows the map center.
                </p>
                <p className="text-xs">Powered by Radio Browser API and Three.js</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full rounded-2xl bg-white py-4 font-bold text-black transition-colors hover:bg-zinc-200"
            >
              Got it
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
