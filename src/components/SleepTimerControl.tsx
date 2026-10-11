import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Moon, X } from 'lucide-react';
import { cn } from '../lib/utils';

interface SleepTimerControlProps {
  deadline: number | null;
  remainingMs: number | null;
  onSetTimer: (minutes: number | null) => void;
}

function formatRemaining(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function SleepTimerControl({
  deadline,
  remainingMs,
  onSetTimer,
}: SleepTimerControlProps) {
  const [open, setOpen] = useState(false);
  const [menuLeft, setMenuLeft] = useState(16);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const active = deadline !== null;
  const remaining = formatRemaining(remainingMs ?? 0);

  useLayoutEffect(() => {
    if (!open) return;
    function updatePosition() {
      const trigger = buttonRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
      const fontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const width =
        menu.getBoundingClientRect().width || Math.min(17 * fontSize, viewportWidth - 32);
      const left = Math.max(
        16,
        Math.min(trigger.getBoundingClientRect().right - width, viewportWidth - width - 16)
      );
      setMenuLeft(left);
    }
    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    if (buttonRef.current) observer.observe(buttonRef.current);
    if (menuRef.current) observer.observe(menuRef.current);
    window.addEventListener('resize', updatePosition);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updatePosition);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    const isInside = (target: EventTarget | null) =>
      target instanceof Node &&
      (rootRef.current?.contains(target) || menuRef.current?.contains(target));
    const closeOutside = (event: PointerEvent) => {
      if (!isInside(event.target)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus({ preventScroll: true });
    };
    const handleFocus = (event: FocusEvent) => {
      if (!isInside(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', handleKey);
    document.addEventListener('focusin', handleFocus);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('focusin', handleFocus);
    };
  }, [open]);

  function chooseTimer(minutes: number | null) {
    onSetTimer(minutes);
    setOpen(false);
    buttonRef.current?.focus({ preventScroll: true });
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        onClick={() => setOpen((current) => !current)}
        aria-label={active ? `Sleep timer: ${remaining} remaining` : 'Sleep timer'}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-haspopup="dialog"
        title={active ? `Playback stops in ${remaining}` : 'Set a sleep timer'}
        className={cn(
          'flex h-10 items-center justify-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors',
          active
            ? 'border-blue-400/30 bg-blue-500/10 text-blue-300'
            : 'border-white/10 bg-white/5 text-white/65 hover:border-white/20 hover:text-white'
        )}
      >
        <Moon className="h-4 w-4" />
        {active && <span className="tabular-nums">{remaining}</span>}
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="dialog"
            aria-label="Sleep timer settings"
            style={{ left: menuLeft }}
            className="fixed bottom-[calc(var(--player-height,112px)+12px)] z-70 w-[min(17rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-zinc-950/95 p-4 shadow-xl shadow-black/40 backdrop-blur-xl"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="text-sm font-medium text-white">Sleep timer</h4>
              <button
                onClick={() => {
                  setOpen(false);
                  buttonRef.current?.focus({ preventScroll: true });
                }}
                aria-label="Close sleep timer"
                className="rounded-lg p-1 text-white/50 hover:bg-white/5 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs leading-relaxed text-white/50">
              {active ? `Playback stops in ${remaining}. ` : 'Pause playback automatically. '}
              Volume gently fades during the final 30 seconds.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[15, 30, 60].map((minutes) => (
                <button
                  key={minutes}
                  onClick={() => chooseTimer(minutes)}
                  aria-label={`Set sleep timer for ${minutes} minutes`}
                  className="rounded-xl border border-white/10 bg-white/5 py-2.5 text-xs font-medium text-white/80 transition-colors hover:border-blue-400/30 hover:bg-blue-500/10 hover:text-blue-300"
                >
                  {minutes} min
                </button>
              ))}
            </div>
            {active && (
              <button
                onClick={() => chooseTimer(null)}
                className="mt-3 w-full rounded-xl py-2 text-xs text-white/60 transition-colors hover:bg-white/5 hover:text-white"
              >
                Cancel timer
              </button>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
