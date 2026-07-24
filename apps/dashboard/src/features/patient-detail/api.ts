import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  PatientDetailView,
  ReissueCodeResult,
  WithdrawPatientResult,
} from '@hospital-ai/shared-types';
import { Language } from '@hospital-ai/shared-types';
import { apiClient } from '../../lib/api-client';

/**
 * D5 patient-detail data layer (TanStack Query). Owns the read of one patient
 * plus the two lifecycle actions (reissue code / withdraw) and enrolment (create).
 * All requests go through `apiClient`, which attaches the staff JWT and handles 401.
 */

export const patientDetailKey = (id: string) => ['patient-detail', id] as const;

/** GET /v1/patients/:id — full enriched detail (adherence series, history, consent). */
export function usePatientDetail(id: string | undefined) {
  return useQuery<PatientDetailView>({
    queryKey: patientDetailKey(id ?? ''),
    queryFn: () => apiClient.get<PatientDetailView>(`/patients/${id}`),
    enabled: Boolean(id),
  });
}

/** POST /v1/patients/:id/reissue-code — invalidates old code; single-use, 14-day. */
export function useReissueCode(id: string) {
  const qc = useQueryClient();
  return useMutation<ReissueCodeResult, unknown, void>({
    mutationFn: () => apiClient.post<ReissueCodeResult>(`/patients/${id}/reissue-code`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: patientDetailKey(id) });
    },
  });
}

/** PATCH /v1/patients/:id/withdraw — stops future tasks/reminders, retains history. */
export function useWithdrawPatient(id: string) {
  const qc = useQueryClient();
  return useMutation<WithdrawPatientResult, unknown, void>({
    mutationFn: () => apiClient.patch<WithdrawPatientResult>(`/patients/${id}/withdraw`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: patientDetailKey(id) });
    },
  });
}

// ---- Enrolment (create) ----------------------------------------------------

/** Request body for POST /v1/patients (mirrors the api EnrolPatientDto). */
export interface EnrolPatientRequest {
  name: string;
  phone: string;
  ageBand: string;
  procedureType: string;
  dischargeDate: string;
  language: Language;
  consentVersion: string;
  consentTextSnapshot: string;
}

/** Wire shape of a successful enrolment (Date → ISO string over HTTP). */
export interface EnrolmentResultView {
  patient: {
    id: string;
    patientRef: string;
    name: string;
    status: string;
    language: string;
    procedureType: string;
    dischargeDate: string;
    planId: string | null;
  };
  enrolmentCode: string;
  codeExpiresAt: string;
  tasksGenerated: number;
}

/** POST /v1/patients — enrol a patient; returns the generated 6-char code. */
export function useEnrolPatient() {
  const qc = useQueryClient();
  return useMutation<EnrolmentResultView, unknown, EnrolPatientRequest>({
    mutationFn: (body) => apiClient.post<EnrolmentResultView>('/patients', body),
    onSuccess: () => {
      // The D4 list is enriched from the same rows; drop it so a fresh patient shows.
      void qc.invalidateQueries({ queryKey: ['patients'] });
    },
  });
}

// ---- Static catalogues (no template-list endpoint exists) ------------------

/** A recovery-plan template offered for a procedure (backend resolves the plan by procedure). */
export interface PlanTemplateOption {
  id: string;
  /** i18n key under patient-detail:templates.<id>. */
  labelKey: string;
}

/** Procedure → recovery-plan template(s). Mirrors the seeded PLAN_TEMPLATES. */
export const PROCEDURE_TEMPLATES: Record<string, PlanTemplateOption[]> = {
  laparoscopic_appendectomy: [
    { id: 'laparoscopic_appendectomy', labelKey: 'templates.laparoscopic_appendectomy' },
  ],
  open_hernia_repair: [
    { id: 'open_hernia_repair', labelKey: 'templates.open_hernia_repair' },
  ],
};

/** Procedure types offered in the create form (i18n key: patient-detail:procedures.<value>). */
export const PROCEDURE_OPTIONS: string[] = Object.keys(PROCEDURE_TEMPLATES);

/** Coarse age bands (never a birth date). */
export const AGE_BANDS: string[] = ['18-29', '30-39', '40-49', '50-59', '60-69', '70+'];

/** Languages offered at enrolment. */
export const LANGUAGE_OPTIONS: Language[] = [Language.UZ, Language.RU, Language.EN];
