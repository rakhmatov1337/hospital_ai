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
}

/** Placeholder sign-off stamp for content that is NOT clinically approved. */
export const PLACEHOLDER_APPROVED_BY = 'PLACEHOLDER — NOT CLINICALLY APPROVED';
