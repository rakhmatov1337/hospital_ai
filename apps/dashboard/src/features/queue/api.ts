import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { EscalationStatus, Tier } from '@hospital-ai/shared-types';
import { apiClient } from '../../lib/api-client';

/**
 * D2 wire types + query hook for the staff check-in queue.
 *
 * These mirror the api's `EscalationQueue`/`EscalationQueueItem`
 * (apps/api/src/escalations/escalations.service.ts). Over HTTP the service's
 * `Date` fields serialise to ISO-8601 strings, and the `tier`/`status` string
 * values are exactly the shared enum members — so they are typed as the enums
 * here for safe consumption.
 */

export type QueueFilter = 'unresolved' | 'all';

/** One row in the staff queue. */
export interface EscalationQueueItem {
  id: string;
  tier: Tier;
  status: EscalationStatus;
  patientRef: string;
  patientName: string;
  recoveryDay: number | null;
  /** ISO-8601 creation time (drives the live elapsed counter + breach flags). */
  createdAt: string;
  /** Whole minutes since creation, computed server-side at fetch time. */
  elapsedMinutes: number;
  /** ISO-8601 latest activity (most recent notification, else creation). */
  lastUpdated: string;
}

/** The queue: three tier sections, never paginated. */
export interface EscalationQueue {
  filter: QueueFilter;
  total: number;
  sections: Record<Tier, EscalationQueueItem[]>;
}

/** Query key factory (filter-scoped). */
export const queueKeys = {
  all: ['escalations'] as const,
  list: (filter: QueueFilter) => ['escalations', filter] as const,
};

/**
 * The queue query. Auto-refreshes every 30 s (spec §D2) — in the background too,
 * so the queue stays live while a clinician reads another tab. No pagination:
 * the response carries every unresolved item, so nothing urgent can be hidden.
 */
export function useEscalationQueue(filter: QueueFilter): UseQueryResult<EscalationQueue> {
  return useQuery({
    queryKey: queueKeys.list(filter),
    queryFn: () =>
      apiClient.get<EscalationQueue>(`/escalations?filter=${encodeURIComponent(filter)}`),
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  });
}

/**
 * A `[TEST]` item — visibly labelled and de-emphasised in the queue. Test
 * fixtures are marked by a `TEST`-tagged patient reference (e.g. `TEST-01`) or an
 * explicit `[TEST]` in the display name; we never infer "test" from a real name.
 */
export function isTestItem(item: EscalationQueueItem): boolean {
  const ref = item.patientRef?.toUpperCase() ?? '';
  const name = item.patientName?.toUpperCase() ?? '';
  return ref.includes('TEST') || name.includes('[TEST]');
}
