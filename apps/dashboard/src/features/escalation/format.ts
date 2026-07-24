import type { DashboardLanguage } from '../../lib/i18n';

/** Locale-aware date+time (e.g. "23 Jul 2026, 14:32"). Safe on bad input. */
export function formatDateTime(iso: string, lang: DashboardLanguage): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(lang, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

/** Locale-aware date only (e.g. "23 Jul 2026"). Safe on bad input. */
export function formatDate(iso: string, lang: DashboardLanguage): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(d);
}

/** Adherence ratio → "80% · 4 of 5" style parts. Null denominator → no data. */
export function adherencePercent(ratio: number | null): string | null {
  if (ratio === null) return null;
  return `${Math.round(ratio * 100)}%`;
}
