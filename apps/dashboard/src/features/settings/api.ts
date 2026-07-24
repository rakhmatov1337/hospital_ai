import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StaffAccount, StaffRole } from '@hospital-ai/shared-types';
import { apiClient } from '../../lib/api-client';
import type { ClinicView } from '../../lib/api-types';

/**
 * D7 (clinic settings) query/mutation hooks.
 *
 * Reads/writes the authenticated clinic (`GET`/`PATCH /v1/clinics/me`) and the
 * clinic's staff accounts (`GET`/`POST`/`PATCH /v1/staff`). The clinic is always
 * taken server-side from the staff token — the client never sends a clinic id.
 */

export type { ClinicView };

/** Partial body for `PATCH /v1/clinics/me` (mirrors the api UpdateClinicDto). */
export interface ClinicUpdatePayload {
  name?: string;
  phone?: string;
  emergencyNumber?: string;
  workingHours?: string;
  workingDays?: string;
  onDutyContact?: string;
  backupContact?: string;
  headContact?: string;
  notifyMinutes?: number;
  ackMinutes?: number;
  breachMinutes?: number;
}

/** Body for `POST /v1/staff`. */
export interface CreateStaffPayload {
  name: string;
  email: string;
  password: string;
  role: StaffRole;
}

/** Body for `PATCH /v1/staff/:id` — partial. */
export interface UpdateStaffPayload {
  name?: string;
  role?: StaffRole;
  active?: boolean;
  password?: string;
}

const clinicKey = ['settings', 'clinic'] as const;
const staffKey = ['settings', 'staff'] as const;

/** GET /v1/clinics/me — the authenticated clinic's configuration. */
export function useClinic() {
  return useQuery({
    queryKey: clinicKey,
    queryFn: () => apiClient.get<ClinicView>('/clinics/me'),
  });
}

/** PATCH /v1/clinics/me — save changed settings; name/phone/emergency are audit-logged server-side. */
export function useUpdateClinic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ClinicUpdatePayload) =>
      apiClient.patch<ClinicView>('/clinics/me', payload),
    onSuccess: (updated) => {
      qc.setQueryData(clinicKey, updated);
    },
  });
}

/** GET /v1/staff — the clinic's staff accounts (never the password hash). */
export function useStaff() {
  return useQuery({
    queryKey: staffKey,
    queryFn: () => apiClient.get<StaffAccount[]>('/staff'),
  });
}

/** POST /v1/staff — create a staff account (clinical_lead only, enforced server-side). */
export function useCreateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateStaffPayload) =>
      apiClient.post<StaffAccount>('/staff', payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: staffKey });
    },
  });
}

/** PATCH /v1/staff/:id — update a staff account (clinical_lead only, enforced server-side). */
export function useUpdateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateStaffPayload }) =>
      apiClient.patch<StaffAccount>(`/staff/${id}`, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: staffKey });
    },
  });
}
