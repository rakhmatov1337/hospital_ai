import type { Denominated, MedianDuration } from './api';

/**
 * Presentation helpers for D6. The golden rule: a percentage is NEVER shown
 * without its denominator. `formatPct` renders only the headline number;
 * `denomText` renders the "n of d" line that must always sit beside it.
 */

const EM_DASH = '—';

/** A ratio in [0,1] → a rounded percentage string, or "—" when the denominator is 0. */
export function formatPct(d: Denominated | undefined | null): string {
  if (!d || d.value == null) return EM_DASH;
  return `${Math.round(d.value * 100)}%`;
}

/** The percentage value as a plain number (for chart Y values); null when undefined. */
export function pctValue(d: Denominated | undefined | null): number | null {
  if (!d || d.value == null) return null;
  return Math.round(d.value * 1000) / 10; // one decimal place
}

/** The mandatory denominator line, e.g. "4 of 5 tasks". Numerator is rounded for display. */
export function denomText(d: Denominated | undefined | null, unit: string): string {
  if (!d) return `0 of 0 ${unit}`;
  return `${round(d.numerator)} of ${d.denominator} ${unit}`;
}

/** A scalar mean (e.g. satisfaction 1–5) → "4.2", or "—" when there are no responses. */
export function formatScore(d: Denominated | undefined | null, digits = 1): string {
  if (!d || d.value == null) return EM_DASH;
  return d.value.toFixed(digits);
}

/** Format a median duration (ms) as compact human text, or "—" when there are no samples. */
export function formatDuration(m: MedianDuration | undefined | null): string {
  if (!m || m.medianMs == null) return EM_DASH;
  const totalSeconds = Math.round(m.medianMs / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
