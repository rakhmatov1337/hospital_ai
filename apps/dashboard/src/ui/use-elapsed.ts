import { useEffect, useState } from 'react';

/**
 * Re-renders every `intervalMs` and returns the current epoch millis. Used to
 * drive the queue's LIVE elapsed counters without a per-row timer.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Whole minutes elapsed between `fromIso` and `now`. */
export function minutesSince(fromIso: string, now: number = Date.now()): number {
  const start = new Date(fromIso).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((now - start) / 60_000));
}

/**
 * Formats elapsed time since `fromIso` as a compact live counter:
 *   < 1h → "M:SS" (e.g. "12:04"); ≥ 1h → "H:MM:SS".
 */
export function formatElapsed(fromIso: string, now: number = Date.now()): string {
  const start = new Date(fromIso).getTime();
  if (Number.isNaN(start)) return '—';
  const totalSeconds = Math.max(0, Math.floor((now - start) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}
