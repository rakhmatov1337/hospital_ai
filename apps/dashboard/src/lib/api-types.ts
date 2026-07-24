/**
 * Response shapes the FOUNDATION needs (login + clinic header). These mirror the
 * api's `StaffSession` (auth.service.ts) and `ClinicView` (clinics.service.ts).
 *
 * Screen agents define their own request/response types in their feature's
 * `api.ts` — do NOT centralise every endpoint here.
 */

/** POST /v1/auth/staff/login response (mirrors api StaffSession). */
export interface StaffLoginResponse {
  audience: 'staff';
  accessToken: string;
  staffId: string;
  clinicId: string;
  role: string;
}

/** GET /v1/clinics/me response (mirrors api ClinicView). */
export interface ClinicView {
  id: string;
  name: string;
  phone: string;
  emergencyNumber: string;
  workingHours: string;
  workingDays: string;
  timezone: string;
  onDutyContact: string | null;
  backupContact: string | null;
  headContact: string | null;
  notifyMinutes: number;
  ackMinutes: number;
  breachMinutes: number;
}
