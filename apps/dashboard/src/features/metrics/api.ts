import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';

/**
 * D6 — Metrics (live) data layer.
 *
 * Mirrors the `MetricsReport` shape returned by `GET /v1/metrics`
 * (apps/api `MetricsService.compute`). Every ratio ships as a `Denominated`
 * triple so the UI can ALWAYS show the denominator behind a percentage
 * (spec D6). `MetricsReport.readmissions` is intentionally NOT surfaced by
 * this screen — the dashboard shows no readmission rate / no outcome claim.
 */

/** A ratio metric that always carries its numerator + denominator. `value` is null when denominator is 0. */
export interface Denominated {
  value: number | null;
  numerator: number;
  denominator: number;
}

/** A median-of-durations metric (ms) with the sample size behind it. */
export interface MedianDuration {
  medianMs: number | null;
  denominator: number;
}

export interface AdherenceMetrics {
  overall: Denominated;
  byRecoveryDay: Record<number, Denominated>;
  byTaskType: Record<string, Denominated>;
}

export interface RetentionMetrics {
  day7: Denominated;
  day14: Denominated;
  day30: Denominated;
}

export interface EscalationMetrics {
  countByTier: Record<string, number>;
  total: number;
  timeToAcknowledge: MedianDuration;
  timeToContact: MedianDuration;
  breachCount: number;
}

export interface LanguageMetrics {
  patientsByLanguage: Record<string, number>;
  patientPopulation: number;
  adherenceByLanguage: Record<string, Denominated>;
}

export interface SatisfactionMetrics {
  q1Helpful: Denominated;
  q2Easy: Denominated;
  q3AdherenceSupport: Denominated;
  q4Recommend: Denominated;
  responseCount: number;
}

export interface EngagementMetrics {
  avgAppOpensPerPatientPerWeek: Denominated;
}

/** Readmissions arrive from the API as a raw count — deliberately never displayed by D6. */
export interface ReadmissionMetrics {
  count: number;
  patientPopulation: number;
  neverARate: true;
}

export interface MetricsReport {
  clinicId: string;
  generatedAt: string;
  adherence: AdherenceMetrics;
  retention: RetentionMetrics;
  checkInCompletion: Denominated;
  escalations: EscalationMetrics;
  language: LanguageMetrics;
  satisfaction: SatisfactionMetrics;
  engagement: EngagementMetrics;
  readmissions: ReadmissionMetrics;
}

/** A named date window for the selector. `from`/`to` are ISO dates; null = unbounded. */
export interface DateRange {
  /** Stable identifier used as the selector value + query-key segment. */
  id: string;
  from: string | null;
  to: string | null;
}

/** Preset windows offered by the date-range selector (default = all time). */
export type RangePresetId = 'all' | 'last7' | 'last14' | 'last30';

/** Build the concrete DateRange for a preset, relative to `now`. */
export function rangeForPreset(preset: RangePresetId, now: Date = new Date()): DateRange {
  if (preset === 'all') return { id: 'all', from: null, to: null };
  const days = preset === 'last7' ? 7 : preset === 'last14' ? 14 : 30;
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const isoDate = (d: Date) => d.toISOString().slice(0, 10);
  return { id: preset, from: isoDate(from), to: isoDate(now) };
}

/** Live metrics query. Auto-refreshes every 30s; the date range is part of the query key + request. */
export function useMetrics(range: DateRange) {
  return useQuery({
    queryKey: ['metrics', range.id, range.from, range.to],
    queryFn: () => {
      const params = new URLSearchParams();
      if (range.from) params.set('from', range.from);
      if (range.to) params.set('to', range.to);
      const qs = params.toString();
      return apiClient.get<MetricsReport>(`/metrics${qs ? `?${qs}` : ''}`);
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
