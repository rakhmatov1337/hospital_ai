import { PatientStatus, type PatientListItem } from '@hospital-ai/shared-types';

/**
 * D4 status filter. Spec exposes Active / Completed / Withdrawn (plus All as the
 * default so nothing is ever hidden). "Active" covers the whole in-programme
 * bucket — both freshly `enrolled` and `active` patients — so an enrolled patient
 * is never invisible under the Active view.
 */
export type PatientFilter = 'all' | 'active' | 'completed' | 'withdrawn';

export const PATIENT_FILTERS: readonly PatientFilter[] = [
  'all',
  'active',
  'completed',
  'withdrawn',
];

export function filterPatients(
  items: readonly PatientListItem[],
  filter: PatientFilter,
): PatientListItem[] {
  switch (filter) {
    case 'active':
      return items.filter(
        (p) => p.status === PatientStatus.active || p.status === PatientStatus.enrolled,
      );
    case 'completed':
      return items.filter((p) => p.status === PatientStatus.completed);
    case 'withdrawn':
      return items.filter((p) => p.status === PatientStatus.withdrawn);
    case 'all':
    default:
      return [...items];
  }
}
