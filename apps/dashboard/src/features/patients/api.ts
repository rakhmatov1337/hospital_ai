import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { PatientListItem, PatientListPage } from '@hospital-ai/shared-types';
import { apiClient } from '../../lib/api-client';

/**
 * D4 patient list data (enriched `GET /v1/patients`).
 *
 * The endpoint is cursor-paginated. The patient list must never hide a patient,
 * so we walk every page (`nextCursor`) and accumulate the full clinic roster
 * before handing it to the table, where filtering/sorting happen client-side.
 */

const PAGE_SIZE = 100;
const MAX_PAGES = 100; // safety bound against a runaway cursor loop

async function fetchAllPatients(): Promise<PatientListItem[]> {
  const items: PatientListItem[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (cursor) query.set('cursor', cursor);
    const result: PatientListPage = await apiClient.get<PatientListPage>(
      `/patients?${query.toString()}`,
    );
    items.push(...result.items);
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }

  return items;
}

export const patientsQueryKey = ['patients', 'list'] as const;

/** Load the full enriched patient roster for the authenticated clinic. */
export function usePatients(): UseQueryResult<PatientListItem[]> {
  return useQuery({
    queryKey: patientsQueryKey,
    queryFn: fetchAllPatients,
  });
}
