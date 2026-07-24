import { Injectable } from '@nestjs/common';
import { Clinic, Patient, RecoveryPlan } from '@prisma/client';
import {
  ERROR_CODES,
  Language,
  PatientStatus,
  TaskType,
} from '@hospital-ai/shared-types';
import { AppError } from '../common/errors';
import { Clock } from '../common/clock';
import { RequestContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { TelemetryService, TelemetryMeta } from '../telemetry/telemetry.service';
import {
  AdherenceTaskRow,
  computeAdherence,
  Denominated,
  groupAdherence,
} from '../telemetry/metrics.service';
import { ContentService } from '../content/content.service';
import { recoveryDay } from '../plans/recovery-day';
import { clinicLocalOffset } from '../checkins/clinic-hours';
import { CHECKIN_QUESTIONS } from '../seed/content-pack';

/**
 * Patient app ("me") service — the P1–P17 read/write surface the Flutter app
 * calls, all scoped to the token's `patientId` (never a request-supplied id, so
 * cross-patient access is structurally impossible).
 *
 * HARD RULE (keeps the SP3-A QA gate green): every value returned to a patient is
 * a content KEY or a categorical/numeric fact — never free text, never a model
 * output, never a judgment. The app resolves keys via `GET /v1/content/:key`.
 */

/** The programme is 30 days; a survey is offered only in the final stretch. */
const PROGRAMME_DAYS = 30;
const SURVEY_MIN_RECOVERY_DAY = 28;
/** The onboarding consent body whose approved text is snapshotted on consent. */
const CONSENT_CONTENT_KEY = 'onboarding.consent_intro';
/** Education unlock content is keyed by taskType `education` in the plan template. */

// ---------------------------------------------------------------------------
// Response shapes (machine tokens + content keys only — no patient-visible text)
// ---------------------------------------------------------------------------

export interface ConsentResult {
  status: PatientStatus;
  consentVersion: string;
  /** True when consent was already recorded (idempotent replay — no second event). */
  alreadyConsented: boolean;
}

export interface ProfileResult {
  firstName: string;
  recoveryDay: number;
  /** N of 30 (clamped to the programme window). */
  programmeDay: number;
  programmeDays: number;
  language: Language;
  procedureType: string;
  clinic: {
    name: string;
    phone: string;
    emergencyNumber: string;
    workingHours: string;
    workingDays: string;
  };
}

/** One task on the Today screen — a content KEY + categorical/temporal facts only. */
export interface TodayTask {
  id: string;
  taskType: TaskType;
  /** Content-library KEY (never patient-visible text). */
  contentRef: string | null;
  scheduledFor: string;
  windowClosesAt: string;
  status: string;
  onTime: boolean | null;
}

export interface TodayResult {
  recoveryDay: number;
  /** Today's tasks grouped by type (each carries only keys + categoricals). */
  groups: Record<string, TodayTask[]>;
  /** True when a check-in is due today per the cadence and not yet completed. */
  checkinDue: boolean;
}

export interface ProgressResult {
  adherence: Denominated;
  daysCompleted: number;
  programmeDays: number;
  perDay: Array<{
    recoveryDay: number;
    value: number | null;
    numerator: number;
    denominator: number;
  }>;
}

export interface CheckinQuestionView {
  ref: string;
  /** Content KEY for the patient-visible question text. */
  questionContentKey: string;
  type: string;
  scale?: { min: number; max: number };
  options?: Array<{ code: string; label: string }>;
}

export interface ContentUnlockItem {
  /** Content-library KEY (resolved by the app via GET /v1/content/:key). */
  contentKey: string;
  /** The recovery day on which this item unlocked. */
  unlockDay: number;
  category: string;
}

export interface ContentResult {
  category: string;
  procedureType: string;
  recoveryDay: number;
  items: ContentUnlockItem[];
}

export interface SurveyResult {
  submitted: true;
  /** True when a survey already existed (idempotent replay — no second event). */
  alreadySubmitted: boolean;
  recoveryDay: number;
}

export interface LanguageResult {
  language: Language;
}

export interface LeaveResult {
  status: PatientStatus;
  /** Future, not-yet-closed tasks removed to stop reminders (history retained). */
  tasksStopped: number;
}

export interface AppOpenedResult {
  recorded: true;
  recoveryDay: number;
}

/** Patient loaded together with its clinic + plan (the shared read for every path). */
type ScopedPatient = Patient & { clinic: Clinic; plan: RecoveryPlan | null };

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly clock: Clock,
    private readonly telemetry: TelemetryService,
    private readonly content: ContentService,
  ) {}

  // -------------------------------------------------------------------------
  // 1. POST /me/consent — record consent, activate, emit patient_enrolled ONCE.
  // -------------------------------------------------------------------------
  async consent(version: string): Promise<ConsentResult> {
    const patient = await this.loadScopedPatient();
    const now = this.clock.now();

    // Idempotent by status: only the first enrolled -> active transition records
    // consent and fires patient_enrolled. Any other status is a no-op replay
    // (never re-activates a withdrawn/completed patient, never a second event).
    if (patient.status !== PatientStatus.enrolled) {
      return {
        status: patient.status as PatientStatus,
        consentVersion: patient.consentVersion ?? version,
        alreadyConsented: true,
      };
    }

    const textSnapshot = await this.resolveConsentSnapshot(patient, version);

    // Consent is append-only — create the patient's acceptance record.
    await this.prisma.consent.create({
      data: { patientId: patient.id, version, acceptedAt: now, textSnapshot },
    });

    await this.prisma.patient.update({
      where: { id: patient.id },
      data: {
        status: PatientStatus.active,
        consentVersion: version,
        consentedAt: now,
      },
    });

    const day = this.recoveryDayOf(patient, now);
    await this.telemetry.emit(
      'patient_enrolled',
      { procedure_type: patient.procedureType, language: patient.language },
      this.meta(patient, day, now),
    );

    return {
      status: PatientStatus.active,
      consentVersion: version,
      alreadyConsented: false,
    };
  }

  // -------------------------------------------------------------------------
  // 2. GET /me/profile — header + settings + clinic contact.
  // -------------------------------------------------------------------------
  async profile(): Promise<ProfileResult> {
    const patient = await this.loadScopedPatient();
    const now = this.clock.now();
    const day = this.recoveryDayOf(patient, now);
    const programmeDays = patient.plan?.durationDays ?? PROGRAMME_DAYS;

    return {
      firstName: firstNameOf(patient.name),
      recoveryDay: day,
      programmeDay: clamp(day, 0, programmeDays),
      programmeDays,
      language: patient.language as Language,
      procedureType: patient.procedureType,
      clinic: {
        name: patient.clinic.name,
        phone: patient.clinic.phone,
        emergencyNumber: patient.clinic.emergencyNumber,
        workingHours: patient.clinic.workingHours,
        workingDays: patient.clinic.workingDays,
      },
    };
  }

  // -------------------------------------------------------------------------
  // 3. GET /me/today — today's tasks (keys only) grouped by type + checkinDue.
  // -------------------------------------------------------------------------
  async today(): Promise<TodayResult> {
    const patient = await this.loadScopedPatient();
    const now = this.clock.now();
    const day = this.recoveryDayOf(patient, now);

    // "Today" = the tasks whose recovery day equals the patient's current day
    // (each task carries the clinic-tz recovery day it was generated for).
    const tasks = await this.prisma.task.findMany({
      where: { patientId: patient.id, recoveryDay: day },
      orderBy: { scheduledFor: 'asc' },
      include: { planItem: { select: { contentRef: true } } },
    });

    const groups: Record<string, TodayTask[]> = {};
    let checkinDue = false;
    for (const t of tasks) {
      const view: TodayTask = {
        id: t.id,
        taskType: t.taskType as TaskType,
        contentRef: t.planItem?.contentRef ?? null,
        scheduledFor: t.scheduledFor.toISOString(),
        windowClosesAt: t.windowClosesAt.toISOString(),
        status: t.status,
        onTime: t.onTime,
      };
      (groups[t.taskType] ??= []).push(view);
      if (t.taskType === TaskType.checkin && t.status !== 'completed') {
        checkinDue = true;
      }
    }

    return { recoveryDay: day, groups, checkinDue };
  }

  // -------------------------------------------------------------------------
  // 4. GET /me/progress — adherence (with denominator) + per-day completion.
  // -------------------------------------------------------------------------
  async progress(): Promise<ProgressResult> {
    const patient = await this.loadScopedPatient();
    const now = this.clock.now();
    const programmeDays = patient.plan?.durationDays ?? PROGRAMME_DAYS;

    const rows = (await this.prisma.task.findMany({
      where: { patientId: patient.id },
      select: {
        taskType: true,
        status: true,
        onTime: true,
        windowClosesAt: true,
        recoveryDay: true,
      },
    })) as AdherenceTaskRow[];

    const overall = computeAdherence(rows, now);
    const byDay = groupAdherence(rows, now, (t) => t.recoveryDay);

    const perDay = Object.entries(byDay)
      .map(([d, m]) => ({
        recoveryDay: Number(d),
        value: m.value,
        numerator: m.numerator,
        denominator: m.denominator,
      }))
      .sort((a, b) => a.recoveryDay - b.recoveryDay);

    // A "completed" day = every assessable task that day was completed on time.
    const daysCompleted = perDay.filter((d) => d.value === 1).length;

    return { adherence: overall, daysCompleted, programmeDays, perDay };
  }

  // -------------------------------------------------------------------------
  // 5. GET /me/checkin/questions — the structured check-in form contract.
  // -------------------------------------------------------------------------
  checkinQuestions(): CheckinQuestionView[] {
    return CHECKIN_QUESTIONS.map((q) => ({
      ref: q.ref,
      questionContentKey: q.contentKey,
      type: q.type,
      ...(q.scale ? { scale: q.scale } : {}),
      ...(q.options ? { options: q.options.map((o) => ({ code: o.code, label: o.label })) } : {}),
    }));
  }

  // -------------------------------------------------------------------------
  // 6. GET /me/content?category=education — unlocked education KEYS.
  // -------------------------------------------------------------------------
  async educationContent(category?: string): Promise<ContentResult> {
    const patient = await this.loadScopedPatient();
    const now = this.clock.now();
    const day = this.recoveryDayOf(patient, now);
    const cat = (category ?? 'education').trim() || 'education';

    // MVP unlocks only educational content (keyed by taskType `education` in the
    // plan). Anything else resolves to an empty set rather than leaking keys.
    if (cat !== 'education' || !patient.planId) {
      return { category: cat, procedureType: patient.procedureType, recoveryDay: day, items: [] };
    }

    const unlocked = await this.prisma.planItem.findMany({
      where: {
        planId: patient.planId,
        taskType: TaskType.education,
        recoveryDay: { lte: day },
      },
      orderBy: { recoveryDay: 'asc' },
      select: { contentRef: true, recoveryDay: true },
    });

    return {
      category: cat,
      procedureType: patient.procedureType,
      recoveryDay: day,
      items: unlocked.map((it) => ({
        contentKey: it.contentRef,
        unlockDay: it.recoveryDay,
        category: cat,
      })),
    };
  }

  // -------------------------------------------------------------------------
  // 7. POST /me/survey — store SurveyResponse (free_text write-only), day~30.
  // -------------------------------------------------------------------------
  async survey(dto: {
    q1Helpful?: number;
    q2Easy?: number;
    q3AdherenceSupport?: number;
    q4Recommend?: number;
    freeText?: string;
  }): Promise<SurveyResult> {
    const patient = await this.loadScopedPatient();
    const now = this.clock.now();
    const day = this.recoveryDayOf(patient, now);

    if (day < SURVEY_MIN_RECOVERY_DAY) {
      throw new AppError(
        ERROR_CODES.FORBIDDEN,
        'The satisfaction survey is only available near the end of the 30-day programme.',
        { recoveryDay: day, availableFromDay: SURVEY_MIN_RECOVERY_DAY },
      );
    }

    // Idempotent: at most one survey per patient. A replay records nothing new
    // and fires no second event.
    const existing = await this.prisma.surveyResponse.findFirst({
      where: { patientId: patient.id },
      select: { id: true },
    });
    if (existing) {
      return { submitted: true, alreadySubmitted: true, recoveryDay: day };
    }

    await this.prisma.surveyResponse.create({
      data: {
        patientId: patient.id,
        completedAt: now,
        q1Helpful: dto.q1Helpful ?? null,
        q2Easy: dto.q2Easy ?? null,
        q3AdherenceSupport: dto.q3AdherenceSupport ?? null,
        q4Recommend: dto.q4Recommend ?? null,
        // free_text is stored WRITE-ONLY — never returned, never read into analytics.
        freeText: dto.freeText ?? null,
      },
    });

    // Telemetry carries only the numeric scores (categorical) — never the free text.
    await this.telemetry.emit(
      'survey_submitted',
      {
        q1_helpful: dto.q1Helpful ?? null,
        q2_easy: dto.q2Easy ?? null,
        q3_adherence_support: dto.q3AdherenceSupport ?? null,
        q4_recommend: dto.q4Recommend ?? null,
      },
      this.meta(patient, day, now),
    );

    return { submitted: true, alreadySubmitted: false, recoveryDay: day };
  }

  // -------------------------------------------------------------------------
  // 8. PATCH /me/language — instant language change + language_changed.
  // -------------------------------------------------------------------------
  async language(language: Language): Promise<LanguageResult> {
    const patient = await this.loadScopedPatient();
    const now = this.clock.now();
    const from = patient.language as Language;

    if (from !== language) {
      await this.prisma.patient.update({
        where: { id: patient.id },
        data: { language },
      });
      await this.telemetry.emit(
        'language_changed',
        { from, to: language },
        this.meta(patient, this.recoveryDayOf(patient, now), now),
      );
    }

    return { language };
  }

  // -------------------------------------------------------------------------
  // 9. POST /me/leave — self-withdraw: halt tasks, RETAIN data, flag clinic.
  // -------------------------------------------------------------------------
  async leave(): Promise<LeaveResult> {
    const patient = await this.loadScopedPatient();
    const now = this.clock.now();

    // Idempotent: an already-withdrawn patient stops nothing further.
    if (patient.status === PatientStatus.withdrawn) {
      return { status: PatientStatus.withdrawn, tasksStopped: 0 };
    }

    // Stop future reminders by removing only future (not-yet-closed) pending tasks.
    // Completed/missed tasks, check-ins, escalations and consent are all RETAINED.
    const removed = await this.prisma.task.deleteMany({
      where: { patientId: patient.id, status: 'pending', windowClosesAt: { gt: now } },
    });

    await this.prisma.patient.update({
      where: { id: patient.id },
      data: { status: PatientStatus.withdrawn },
    });

    // Flag the clinic via the append-only Event stream (surfaced on the dashboard).
    await this.telemetry.emit(
      'patient_withdrawn',
      { initiated_by: 'patient' },
      this.meta(patient, this.recoveryDayOf(patient, now), now),
    );

    return { status: PatientStatus.withdrawn, tasksStopped: removed.count };
  }

  // -------------------------------------------------------------------------
  // 10. POST /me/app-opened — engagement telemetry (categorical).
  // -------------------------------------------------------------------------
  async appOpened(): Promise<AppOpenedResult> {
    const patient = await this.loadScopedPatient();
    const now = this.clock.now();
    const day = this.recoveryDayOf(patient, now);

    await this.telemetry.emit('app_opened', {}, this.meta(patient, day, now));

    return { recorded: true, recoveryDay: day };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * Load the caller's patient (from the token's `patientId`, never a request id)
   * with its clinic + plan, and assert the token's clinic owns it. A missing
   * patient token is UNAUTHORIZED; a clinic mismatch is CROSS_CLINIC_FORBIDDEN.
   */
  private async loadScopedPatient(): Promise<ScopedPatient> {
    const patientId = this.ctx.patientId;
    if (!patientId) {
      throw new AppError(
        ERROR_CODES.UNAUTHORIZED,
        'A patient token is required for this action.',
      );
    }
    const clinicId = this.ctx.requireClinicId();

    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      include: { clinic: true, plan: true },
    });
    if (!patient) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Patient not found.', { patientId });
    }
    if (patient.clinicId !== clinicId) {
      throw new AppError(
        ERROR_CODES.CROSS_CLINIC_FORBIDDEN,
        'Patient does not belong to the authenticated clinic.',
      );
    }
    return patient as ScopedPatient;
  }

  private recoveryDayOf(patient: ScopedPatient, now: Date): number {
    return recoveryDay(patient.dischargeDate, now, patient.clinic.timezone);
  }

  private meta(patient: ScopedPatient, day: number, now: Date): TelemetryMeta {
    return {
      clinicId: patient.clinicId,
      patientRef: patient.patientRef,
      recoveryDay: day,
      localOffset: clinicLocalOffset(now, patient.clinic.timezone),
      occurredAt: now,
    };
  }

  /**
   * Snapshot the APPROVED onboarding consent text (in the patient's language) for
   * the immutable consent record. Best-effort: if that content is not yet
   * clinician-approved (fail-closed resolver), fall back to a minimal marker so
   * consent is still recorded — the snapshot is a stored write, never a response.
   */
  private async resolveConsentSnapshot(
    patient: ScopedPatient,
    version: string,
  ): Promise<string> {
    try {
      const resolved = await this.content.resolve(
        CONSENT_CONTENT_KEY,
        patient.language as Language,
      );
      return resolved.text;
    } catch {
      return `consent-accepted:key=${CONSENT_CONTENT_KEY};version=${version}`;
    }
  }
}

// ---------------------------------------------------------------------------
// Pure helpers (no I/O)
// ---------------------------------------------------------------------------

/** First whitespace-separated token of a name (falls back to the full name). */
function firstNameOf(name: string): string {
  const trimmed = name.trim();
  const first = trimmed.split(/\s+/)[0];
  return first || trimmed;
}

/** Clamp `n` into the inclusive [min, max] range. */
function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}
