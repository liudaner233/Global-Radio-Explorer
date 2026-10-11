import { useCallback, useEffect, useRef, useState } from 'react';

interface TimerState {
  deadline: number | null;
  remainingMs: number | null;
}

const INACTIVE_TIMER: TimerState = { deadline: null, remainingMs: null };
const FADE_DURATION_MS = 30_000;

export function useSleepTimer(onExpire: () => void) {
  const [timer, setTimerState] = useState<TimerState>(INACTIVE_TIMER);
  const deadlineRef = useRef<number | null>(null);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  const setTimer = useCallback((minutes: number | null) => {
    if (minutes === null) {
      deadlineRef.current = null;
      setTimerState(INACTIVE_TIMER);
      return;
    }
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    const remainingMs = minutes * 60_000;
    const deadline = Date.now() + remainingMs;
    if (!Number.isFinite(deadline)) return;
    deadlineRef.current = deadline;
    setTimerState({ deadline, remainingMs });
  }, []);

  useEffect(() => {
    const deadline = timer.deadline;
    if (deadline === null) return;
    const stopAt = deadline;
    let disposed = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    function checkDeadline() {
      clearTimeout(timeout);
      if (disposed || deadlineRef.current !== stopAt) return;
      const remainingMs = Math.max(0, stopAt - Date.now());
      if (remainingMs === 0) {
        deadlineRef.current = null;
        setTimerState(INACTIVE_TIMER);
        onExpireRef.current();
        return;
      }
      setTimerState((current) =>
        current.remainingMs === remainingMs ? current : { deadline: stopAt, remainingMs }
      );
      timeout = setTimeout(checkDeadline, Math.min(1_000, remainingMs));
    }

    checkDeadline();
    document.addEventListener('visibilitychange', checkDeadline);
    window.addEventListener('focus', checkDeadline);
    return () => {
      disposed = true;
      clearTimeout(timeout);
      document.removeEventListener('visibilitychange', checkDeadline);
      window.removeEventListener('focus', checkDeadline);
    };
  }, [timer.deadline]);

  const fadeProgress =
    timer.remainingMs === null ? 1 : Math.min(1, timer.remainingMs / FADE_DURATION_MS);
  const fadeFactor = fadeProgress * fadeProgress * (3 - 2 * fadeProgress);

  return { ...timer, fadeFactor, setTimer };
}
