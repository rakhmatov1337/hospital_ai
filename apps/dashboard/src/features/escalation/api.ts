import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';

/**
 * D3 escalation-detail data layer.
 *
 * Types mirror the api's `EscalationDetail` / `EscalationActionResult` shapes
 * (SP2 `escalations.service.ts`) — Date fields arrive as ISO strings over JSON.
 * There is deliberately NO delete/edit hook: an escalation only ever moves
 * forward via acknowledge → contact-with-outcome.
 */

/** Closed set of contact outcomes (mirrors the api ContactEscalationDto). */
export const OUTCOME_CODES = [
  'advised_at_home',
  'attend_clinic',
  'referred_emergency',
  'no_action',
  'unable_to_reach',
] as const;

export type OutcomeCode = (typeof OUTCOME_CODES)[number];

export interface EscalationAnswer {
  questionRef: string;
  answerValue: string;
}

export interface NotificationTimelineItem {
  attemptNumber: number;
  recipientRole: string;
  channel: string;
  sentAt: string;
  delivered: boolean;
}

export interface RecentCheckIn {
  id: string;
  submittedAt: string;
  recoveryDay: number;
  tier: string | null;
}

export interface AdherenceSnapshot {
  completedOnTime: number;
  assignedWindowClosed: number;
  /** completedOnTime ÷ assignedWindowClosed, or null when the denominator is 0. */
  ratio: number | null;
}

export interface EscalationPatient {
  patientRef: string;
  name: string;
  ageBand: string;
  procedureType: string;
  dischargeDate: string;
  recoveryDay: number;
  phone: string;
}

export interface EscalationDetail {
  id: string;
  tier: string;
  status: string;
  outcomeCode: string | null;
  clinicalNote: string | null;
  createdAt: string;
  ruleVersion: string;
  patient: EscalationPatient;
  answers: EscalationAnswer[];
  notifications: NotificationTimelineItem[];
  recentCheckIns: RecentCheckIn[];
  adherence: AdherenceSnapshot;
}

export interface EscalationActionResult {
  id: string;
  status: string;
  outcomeCode?: string | null;
}

export interface ContactPayload {
  outcomeCode: OutcomeCode;
  clinicalNote?: string;
}

const detailKey = (id: string) => ['escalation', 'detail', id] as const;

/** Full escalation detail. */
export function useEscalationDetail(id: string) {
  return useQuery({
    queryKey: detailKey(id),
    queryFn: () => apiClient.get<EscalationDetail>(`/escalations/${id}`),
    enabled: id.length > 0,
  });
}

/**
 * Acknowledge (halts the ladder). First-ack-wins: a second caller gets a 409
 * whose `details.status` reveals the real current state. On both success and
 * error we refetch the detail so the UI reflects who/what already advanced it.
 */
export function useAcknowledge(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.post<EscalationActionResult>(`/escalations/${id}/acknowledge`),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: detailKey(id) });
    },
  });
}

/** Record the patient-contact OUTCOME (required) and close the escalation. */
export function useContact(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ContactPayload) =>
      apiClient.post<EscalationActionResult>(`/escalations/${id}/contact`, payload),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: detailKey(id) });
    },
  });
}
