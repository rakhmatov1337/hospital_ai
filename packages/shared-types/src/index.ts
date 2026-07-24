/**
 * Shared enums, error codes and cross-cutting types for Hospital AI.
 *
 * These enum string VALUES mirror the Prisma enum members exactly (snake_case),
 * so the same literals flow across the api <-> dashboard boundary and the DB.
 *
 * Do NOT put patient-visible display strings here — patient-facing text resolves
 * from ContentTranslation by (content_key + language). Only machine tokens live here.
 */

// ---------------------------------------------------------------------------
// Pinned domain enums (mirrors prisma/schema.prisma)
// ---------------------------------------------------------------------------

export enum Language {
  UZ = 'UZ',
  RU = 'RU',
  EN = 'EN',
}

export enum StaffRole {
  staff = 'staff',
  clinical_lead = 'clinical_lead',
}

export enum PatientStatus {
  enrolled = 'enrolled',
  active = 'active',
  completed = 'completed',
  withdrawn = 'withdrawn',
}

export enum TaskType {
  medication = 'medication',
  activity = 'activity',
  wound_care = 'wound_care',
  education = 'education',
  checkin = 'checkin',
}

export enum TaskStatus {
  pending = 'pending',
  completed = 'completed',
  missed = 'missed',
}

export enum Tier {
  emergency = 'emergency',
  urgent = 'urgent',
  routine = 'routine',
}

export enum EscalationStatus {
  new = 'new',
  acknowledged = 'acknowledged',
  contacted = 'contacted',
  breached = 'breached',
}

export enum ContentStatus {
  draft = 'draft',
  approved = 'approved',
}

/** Forward-only escalation status ladder (index = allowed progression order). */
export const ESCALATION_STATUS_ORDER: readonly EscalationStatus[] = [
  EscalationStatus.new,
  EscalationStatus.acknowledged,
  EscalationStatus.contacted,
  EscalationStatus.breached,
];

// ---------------------------------------------------------------------------
// Machine-readable error codes (HTTP body: { code, message, details })
// ---------------------------------------------------------------------------

export const ERROR_CODES = {
  /** Enrolment refused: required clinical content lacks a real clinician sign-off. */
  CLINICAL_CONTENT_NOT_APPROVED: 'CLINICAL_CONTENT_NOT_APPROVED',
  /** Content resolver: requested key/language is not approved (fail-closed, no fallback). */
  CONTENT_NOT_APPROVED: 'CONTENT_NOT_APPROVED',
  /** Tenancy: attempt to touch another clinic's data. */
  CROSS_CLINIC_FORBIDDEN: 'CROSS_CLINIC_FORBIDDEN',
  /** Auth: a token of the wrong audience was presented (patient token at staff route, etc.). */
  WRONG_TOKEN_AUDIENCE: 'WRONG_TOKEN_AUDIENCE',
  /** Idempotency: a request replays an already-applied Idempotency-Key. */
  DUPLICATE_REQUEST: 'DUPLICATE_REQUEST',
  /** DTO/class-validator failure. */
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  /** Resource lookup miss. */
  NOT_FOUND: 'NOT_FOUND',
  /** Immutability: mutation attempted on an append-only model. */
  APPEND_ONLY_VIOLATION: 'APPEND_ONLY_VIOLATION',
  /** Immutability: edit attempted on an approved ContentTranslation row. */
  CONTENT_IMMUTABLE: 'CONTENT_IMMUTABLE',
  /** Escalation status moved backwards / illegally. */
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  /** Auth: missing/invalid credentials. */
  UNAUTHORIZED: 'UNAUTHORIZED',
  /** Authorization: authenticated but not permitted. */
  FORBIDDEN: 'FORBIDDEN',
  /** Catch-all internal failure. */
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Canonical HTTP error body shape. */
export interface ApiErrorBody {
  code: ErrorCode | string;
  message: string;
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Auth / request context
// ---------------------------------------------------------------------------

export type TokenAudience = 'patient' | 'staff';

/** Per-request context (populated from the verified JWT by the auth layer). */
export interface RequestContextData {
  clinicId?: string;
  audience?: TokenAudience;
  staffId?: string;
  patientId?: string;
  /** Staff role (only present for `aud:"staff"` tokens). Gates clinical_lead-only actions. */
  role?: StaffRole;
}

/** Placeholder sign-off stamp for content that is NOT clinically approved. */
export const PLACEHOLDER_APPROVED_BY = 'PLACEHOLDER — NOT CLINICALLY APPROVED';

// ---------------------------------------------------------------------------
// SP4 dashboard response DTOs (backend gaps — D4/D5/D7/D8)
//
// These are the WIRE shapes the clinician dashboard consumes. Timestamps are
// ISO-8601 strings (JSON serialises Date -> string over HTTP). Machine tokens
// only — never patient-visible display strings (those resolve from content).
// ---------------------------------------------------------------------------

// ---- Patients (D4 list / D5 detail) ---------------------------------------

/** One enriched row in the D4 patient list. */
export interface PatientListItem {
  id: string;
  patientRef: string;
  name: string;
  status: PatientStatus;
  language: Language;
  procedureType: string;
  dischargeDate: string;
  recoveryDay: number;
  /** completed-on-time ÷ window-closed assigned tasks (0..1), null when nothing is assessable yet. */
  adherence: number | null;
  adherenceNumerator: number;
  adherenceDenominator: number;
  /** Most recent patient activity (last check-in or task completion), ISO, or null. */
  lastActive: string | null;
  /** Escalations not yet closed with an outcome (status != contacted). */
  openEscalations: number;
  /** Server-computed: adherence < 50% OR no activity in 3+ days. */
  attentionFlag: boolean;
  createdAt: string;
}

/** A cursor-paginated page of enriched patient rows. */
export interface PatientListPage {
  items: PatientListItem[];
  nextCursor: string | null;
}

/** One point on the adherence-over-time series (by recovery day). */
export interface AdherencePoint {
  recoveryDay: number;
  value: number | null;
  numerator: number;
  denominator: number;
}

/** One task in the completion history. */
export interface TaskHistoryItem {
  id: string;
  taskType: TaskType;
  recoveryDay: number;
  scheduledFor: string;
  windowClosesAt: string;
  status: TaskStatus;
  onTime: boolean | null;
  completedAt: string | null;
}

/** One check-in in the patient history, with its tier + escalation outcome (if any). */
export interface CheckInHistoryItem {
  id: string;
  submittedAt: string;
  recoveryDay: number;
  tier: Tier | null;
  outcomeCode: string | null;
  escalationStatus: EscalationStatus | null;
}

/** One escalation in the patient history. */
export interface EscalationHistoryItem {
  id: string;
  tier: Tier;
  status: EscalationStatus;
  outcomeCode: string | null;
  createdAt: string;
}

/** The immutable consent record. */
export interface ConsentRecord {
  version: string;
  acceptedAt: string;
}

/** Full D5 patient detail. */
export interface PatientDetailView {
  id: string;
  patientRef: string;
  name: string;
  phone: string;
  ageBand: string;
  status: PatientStatus;
  language: Language;
  procedureType: string;
  dischargeDate: string;
  recoveryDay: number;
  planId: string | null;
  enrolmentCode: string;
  codeExpiresAt: string | null;
  consentVersion: string | null;
  consentedAt: string | null;
  adherence: number | null;
  adherenceNumerator: number;
  adherenceDenominator: number;
  lastActive: string | null;
  openEscalations: number;
  attentionFlag: boolean;
  adherenceOverTime: AdherencePoint[];
  taskHistory: TaskHistoryItem[];
  checkIns: CheckInHistoryItem[];
  escalations: EscalationHistoryItem[];
  consent: ConsentRecord | null;
}

/** Result of re-issuing a patient enrolment code. */
export interface ReissueCodeResult {
  patientId: string;
  enrolmentCode: string;
  codeExpiresAt: string;
}

/** Result of withdrawing a patient. */
export interface WithdrawPatientResult {
  patientId: string;
  status: PatientStatus;
  tasksStopped: number;
}

// ---- Clinic settings + staff (D7) -----------------------------------------

/** Staff-facing clinic configuration (matches GET/PATCH /v1/clinics/me). */
export interface ClinicSettingsView {
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

/** One append-only audit-log entry (name/phone/emergency changes). */
export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  actorRole: string | null;
  entity: string;
  entityId: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

/** A staff account (never carries the password hash). */
export interface StaffAccount {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  active: boolean;
  createdAt: string;
}

// ---- Content approval (D8) ------------------------------------------------

/**
 * Review status of a single translation, derived from its row:
 *  - `draft`        : status = draft (being edited / awaiting approval)
 *  - `needs_review` : status = approved but isPlaceholder (no real clinician sign-off yet)
 *  - `approved`     : status = approved and NOT a placeholder (real sign-off)
 */
export type ContentReviewStatus = 'draft' | 'needs_review' | 'approved';

/** One translation version in the D8 side-by-side / version history. */
export interface ContentTranslationView {
  id: string;
  language: Language;
  text: string;
  version: number;
  status: ContentStatus;
  reviewStatus: ContentReviewStatus;
  isPlaceholder: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
}

/** Per-language state for one content item (current + full version history). */
export interface ContentLanguageState {
  language: Language;
  present: boolean;
  /** 'missing' when the clinic has no translation for this language. */
  reviewStatus: ContentReviewStatus | 'missing';
  current: ContentTranslationView | null;
  history: ContentTranslationView[];
}

/** One row in the D8 content list. */
export interface ContentListItem {
  id: string;
  clinicId: string | null;
  category: string;
  contentKey: string;
  /** Item-level status: 'approved' only when every language has a real approved sign-off. */
  status: 'approved' | 'needs_review';
  languagesPresent: Language[];
  missingLanguages: Language[];
  /** True when any language is draft, placeholder, or missing (the launch-blocker set). */
  needsApproval: boolean;
  lastApprovedBy: string | null;
  lastApprovedAt: string | null;
}

/** Full D8 item detail: the three languages side by side with version history. */
export interface ContentItemDetail {
  id: string;
  clinicId: string | null;
  category: string;
  contentKey: string;
  status: 'approved' | 'needs_review';
  languages: ContentLanguageState[];
}

/** Result of an approve / request-changes action (per item PER language). */
export interface ContentActionResult {
  translationId: string;
  contentItemId: string;
  language: Language;
  version: number;
  status: ContentStatus;
  reviewStatus: ContentReviewStatus;
  approvedBy: string | null;
  approvedAt: string | null;
}

/** The launch-blocker badge count. */
export interface UnapprovedCountResult {
  unapprovedItems: number;
  totalItems: number;
}
