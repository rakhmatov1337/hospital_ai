import type { MetricsReport } from './api';

/**
 * CSV export — ANONYMISED by construction. It emits only aggregate numbers
 * (counts, ratios, medians) and language CODES; no patient reference, name,
 * phone or free text is ever read. Readmissions are omitted (no outcome claim).
 * Every ratio row carries its numerator + denominator so a percentage in the
 * export is never divorced from the figures behind it.
 */

interface CsvRow {
  section: string;
  metric: string;
  value: string;
  numerator: string;
  denominator: string;
}

function ratioRows(report: MetricsReport): CsvRow[] {
  const rows: CsvRow[] = [];
  const push = (section: string, metric: string, value: string, num: number | string, den: number | string) =>
    rows.push({ section, metric, value, numerator: String(num), denominator: String(den) });

  const pct = (v: number | null) => (v == null ? '' : `${Math.round(v * 100)}%`);

  const a = report.adherence.overall;
  push('Adherence', 'Overall on-time', pct(a.value), a.numerator, a.denominator);
  for (const [day, d] of Object.entries(report.adherence.byRecoveryDay).sort(
    (x, y) => Number(x[0]) - Number(y[0]),
  )) {
    push('Adherence', `Recovery day ${day}`, pct(d.value), d.numerator, d.denominator);
  }

  const r = report.retention;
  push('Retention', 'Active at day 7', pct(r.day7.value), r.day7.numerator, r.day7.denominator);
  push('Retention', 'Active at day 14', pct(r.day14.value), r.day14.numerator, r.day14.denominator);
  push('Retention', 'Active at day 30', pct(r.day30.value), r.day30.numerator, r.day30.denominator);

  const c = report.checkInCompletion;
  push('Engagement', 'Check-in completion', pct(c.value), c.numerator, c.denominator);
  const opens = report.engagement.avgAppOpensPerPatientPerWeek;
  push(
    'Engagement',
    'Avg app opens / patient / week',
    opens.value == null ? '' : opens.value.toFixed(1),
    opens.numerator,
    opens.denominator,
  );

  const e = report.escalations;
  for (const tier of ['emergency', 'urgent', 'routine']) {
    push('Escalations', `Count — ${tier}`, String(e.countByTier[tier] ?? 0), e.countByTier[tier] ?? 0, e.total);
  }
  push('Escalations', 'Breaches', String(e.breachCount), e.breachCount, e.total);
  push(
    'Escalations',
    'Median time-to-acknowledge (ms)',
    e.timeToAcknowledge.medianMs == null ? '' : String(Math.round(e.timeToAcknowledge.medianMs)),
    e.timeToAcknowledge.denominator,
    e.total,
  );
  push(
    'Escalations',
    'Median time-to-contact (ms)',
    e.timeToContact.medianMs == null ? '' : String(Math.round(e.timeToContact.medianMs)),
    e.timeToContact.denominator,
    e.total,
  );

  for (const [lang, count] of Object.entries(report.language.patientsByLanguage)) {
    push('Language', `Patients — ${lang}`, String(count), count, report.language.patientPopulation);
  }
  for (const [lang, d] of Object.entries(report.language.adherenceByLanguage)) {
    push('Language', `Adherence — ${lang}`, pct(d.value), d.numerator, d.denominator);
  }

  const s = report.satisfaction;
  const score = (v: number | null) => (v == null ? '' : v.toFixed(1));
  push('Satisfaction', 'Q1 helpful (1–5)', score(s.q1Helpful.value), s.q1Helpful.denominator, s.responseCount);
  push('Satisfaction', 'Q2 easy (1–5)', score(s.q2Easy.value), s.q2Easy.denominator, s.responseCount);
  push('Satisfaction', 'Q3 adherence support (1–5)', score(s.q3AdherenceSupport.value), s.q3AdherenceSupport.denominator, s.responseCount);
  push('Satisfaction', 'Q4 recommend (1–5)', score(s.q4Recommend.value), s.q4Recommend.denominator, s.responseCount);

  return rows;
}

function escapeCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Build the anonymised CSV text for a metrics report. */
export function metricsToCsv(report: MetricsReport): string {
  const header = ['section', 'metric', 'value', 'numerator', 'denominator'];
  const lines = [header.join(',')];
  for (const row of ratioRows(report)) {
    lines.push([row.section, row.metric, row.value, row.numerator, row.denominator].map(escapeCell).join(','));
  }
  return lines.join('\n');
}

/** Trigger a browser download of the anonymised CSV. */
export function downloadMetricsCsv(report: MetricsReport, filenameBase = 'metrics'): void {
  const csv = metricsToCsv(report);
  const stamp = report.generatedAt.slice(0, 10);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filenameBase}-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
