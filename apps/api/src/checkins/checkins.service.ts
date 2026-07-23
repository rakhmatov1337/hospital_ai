import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ERROR_CODES, Language, Tier } from '@hospital-ai/shared-types';
import { AppError } from '../common/errors';
import { Clock } from '../common/clock';
import { RequestContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { EscalationsRepository } from '../escalations/escalations.repository';
import { TelemetryService } from '../telemetry/telemetry.service';
import { ContentService } from '../content/content.service';
import { recoveryDay } from '../plans/recovery-day';
import { CHECKIN_QUESTIONS } from '../seed/content-pack';
import { TierEngine, AnswerMap, TierRule } from './tier-engine';
import { SubmitCheckinDto } from './dto/submit-checkin.dto';
import {
  ClinicHoursConfig,
  clinicLocalOffset,
  clinicOpeningTime,
  isWithinClinicHours,
} from './clinic-hours';

/** Question-set version stamped on a CheckIn when the client omits one. */
const DEFAULT_QUESTION_SET_VERSION = 'placeholder-v1';

/** One persisted check-in answer row (categorical/numeric string only). */
interface AnswerRow {
  questionRef: string;
  answerValue: string;
}

/**
 * The check-in submission result. The patient client receives a content **KEY**
 * (never a judgment, never model text) plus a best-effort resolved+interpolated
 * body for convenience; the app itself never assesses symptoms.
 */
export interface CheckinSubmissionResult {
  checkinId: string;
  tier: Tier;
  ruleVersion: string;
  recoveryDay: number;
  withinClinicHours: boolean;
  /** The tier→content key (spec §4/§8). */
  contentKey: string;
  /** Resolved + clinic-interpolated body, or null if content is not approved yet. */
  body: string | null;
  /** Set only when an urgent/emergency escalation was created. */
  escalationId: string | null;
}

/**
 * Check-in submission + deterministic tiering (SP2 spec §4).
 *
 * The tier is decided SERVER-SIDE by the pure {@link TierEngine} against the
 * clinic's active `EscalationRule` rows — never client-side, never by a model.
 * Urgent/emergency check-ins append an `Escalation` (status `new`) that the
 * ladder job picks up. The response is a content KEY, not text.
 */
@Injectable()
export class CheckinsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly ctx: RequestContext,
    private readonly escalations: EscalationsRepository,
    private readonly telemetry: TelemetryService,
    private readonly content: ContentService,
  ) {}

  async submit(
    dto: SubmitCheckinDto,
    idempotencyKey: string,
  ): Promise<CheckinSubmissionResult> {
    if (!idempotencyKey || idempotencyKey.trim() === '') {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        'Idempotency-Key is required to submit a check-in.',
        { field: 'Idempotency-Key' },
      );
    }

    const patientId = this.ctx.patientId;
    if (!patientId) {
      throw new AppError(
        ERROR_CODES.UNAUTHORIZED,
        'A patient token is required to submit a check-in.',
      );
    }
    const clinicId = this.ctx.requireClinicId();

    const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Patient not found.', { patientId });
    }
    // Defence in depth: the token's patient and clinic must belong together.
    if (patient.clinicId !== clinicId) {
      throw new AppError(
        ERROR_CODES.CROSS_CLINIC_FORBIDDEN,
        'Patient does not belong to the authenticated clinic.',
      );
    }

    const clinic = await this.prisma.clinic.findUnique({ where: { id: clinicId } });
    if (!clinic) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Clinic not found.', { clinicId });
    }

    // Per-patient idempotency: prefix the client key with the patient id so two
    // patients can never collide on the globally-unique submission_key column.
    const submissionKey = `${patientId}:${idempotencyKey}`;

    // Replay short-circuit — a repeated key yields the already-applied check-in
    // (and its single escalation), never a second write.
    const existing = await this.prisma.checkIn.findUnique({
      where: { submissionKey },
      include: { escalation: true },
    });
    if (existing) {
      const withinHours = existing.withinClinicHours;
      const tier = (existing.tierAssigned ?? Tier.routine) as Tier;
      const contentKey = contentKeyForTier(tier, withinHours);
      return {
        checkinId: existing.id,
        tier,
        ruleVersion: existing.ruleVersion,
        recoveryDay: existing.recoveryDay,
        withinClinicHours: withinHours,
        contentKey,
        body: await this.resolveBody(contentKey, patient.language as Language, clinic),
        escalationId: existing.escalation?.id ?? null,
      };
    }

    // 1. Validate the answer set (rejects unknown refs, bad codes, free text).
    const { answerMap, rows } = validateAnswers(dto.answers);

    // 2. Time-derived facts, computed in the clinic timezone via the Clock.
    const now = this.clock.now();
    const recovery = recoveryDay(patient.dischargeDate, now, clinic.timezone);
    const withinHours = isWithinClinicHours(now, clinic as ClinicHoursConfig);

    // 3. Deterministic tiering against the clinic's active rules.
    const rules = await this.loadActiveRules(clinicId);
    const { tier, ruleVersion } = TierEngine.assign(answerMap, rules);

    // 4. Persist the check-in + its answers (single write).
    let checkin;
    try {
      checkin = await this.prisma.checkIn.create({
        data: {
          patientId,
          submittedAt: now,
          recoveryDay: recovery,
          questionSetVersion: dto.questionSetVersion ?? DEFAULT_QUESTION_SET_VERSION,
          ruleVersion,
          tierAssigned: tier,
          withinClinicHours: withinHours,
          submissionKey,
          answers: { create: rows.map((r) => ({ ...r })) },
        },
      });
    } catch (err) {
      // Concurrent replay with the same key — return the already-applied row.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return this.submit(dto, idempotencyKey);
      }
      throw err;
    }

    // 5. Urgent/emergency → append an escalation (status `new`) for the ladder.
    let escalationId: string | null = null;
    if (tier === Tier.urgent || tier === Tier.emergency) {
      const escalation = await this.escalations.create({
        checkinId: checkin.id,
        patientId,
        tier,
      });
      escalationId = escalation.id;
    }

    // 6. Telemetry — categorical only (tier + within_hours), never symptoms.
    const localOffset = clinicLocalOffset(now, clinic.timezone);
    await this.telemetry.emit(
      'checkin_submitted',
      { tier, within_hours: withinHours },
      {
        clinicId,
        patientRef: patient.patientRef,
        recoveryDay: recovery,
        localOffset,
        occurredAt: now,
      },
    );
    if (escalationId) {
      await this.telemetry.emit(
        'escalation_created',
        { tier },
        {
          clinicId,
          patientRef: patient.patientRef,
          recoveryDay: recovery,
          localOffset,
          occurredAt: now,
        },
      );
    }

    // 7. Return the tier→content KEY (+ best-effort interpolated body).
    const contentKey = contentKeyForTier(tier, withinHours);
    return {
      checkinId: checkin.id,
      tier,
      ruleVersion,
      recoveryDay: recovery,
      withinClinicHours: withinHours,
      contentKey,
      body: await this.resolveBody(contentKey, patient.language as Language, clinic),
      escalationId,
    };
  }

  /** The clinic's active tiering rules (explicit clinic filter — never cross-clinic). */
  private async loadActiveRules(clinicId: string): Promise<TierRule[]> {
    const rows = await this.prisma.escalationRule.findMany({
      where: { clinicId, active: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      version: r.version,
      tier: r.tier,
      conditions: r.conditions,
    }));
  }

  /**
   * Best-effort resolve + clinic-token interpolation of the content body. The
   * KEY is the contract; the body is a convenience. If the content is not yet
   * clinician-approved (fail-closed resolver) we return null rather than fail the
   * submission — the client resolves the key itself.
   */
  private async resolveBody(
    contentKey: string,
    language: Language,
    clinic: { name: string; phone: string; emergencyNumber: string; workingHours: string },
  ): Promise<string | null> {
    try {
      const resolved = await this.content.resolve(contentKey, language);
      return interpolateClinicTokens(resolved.text, clinic);
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Pure helpers (no I/O)
// ---------------------------------------------------------------------------

/**
 * Tier → content KEY (spec §4/§8). EMERGENCY always returns `emergency.headline`
 * regardless of hours (it self-directs to 103, 24/7). Out-of-hours collapses
 * urgent AND routine onto the out-of-hours confirmation.
 */
export function contentKeyForTier(tier: Tier, withinClinicHours: boolean): string {
  if (tier === Tier.emergency) return 'emergency.headline';
  if (!withinClinicHours) return 'checkin.submitted.out_of_hours';
  if (tier === Tier.urgent) return 'checkin.submitted.urgent';
  return 'checkin.submitted.routine';
}

/** Interpolate the clinic tokens into an already-resolved (approved) string. */
export function interpolateClinicTokens(
  text: string,
  clinic: { name: string; phone: string; emergencyNumber: string; workingHours: string },
): string {
  return text
    .replace(/\{CLINIC_NAME\}/g, clinic.name)
    .replace(/\{CLINIC_PHONE\}/g, clinic.phone)
    .replace(/\{CLINIC_EMERGENCY\}/g, clinic.emergencyNumber)
    .replace(/\{OPENING_TIME\}/g, clinicOpeningTime(clinic.workingHours));
}

/**
 * Validate the answer set against CHECKIN_QUESTIONS and build both the in-memory
 * AnswerMap (for the tier engine) and the persisted rows.
 *
 * Rejects (VALIDATION_ERROR): duplicate refs, unknown refs, a missing question,
 * a wrong value shape, an unknown categorical code, or an out-of-range/non-integer
 * scale value. "Free text" is precisely any value that is not one of a question's
 * declared codes or a numeric-in-range — so free text can never be stored.
 */
export function validateAnswers(
  answers: Array<{ ref: string; value: unknown }>,
): { answerMap: AnswerMap; rows: AnswerRow[] } {
  const byRef = new Map<string, unknown>();
  for (const a of answers) {
    if (byRef.has(a.ref)) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        `Duplicate answer for question '${a.ref}'.`,
        { ref: a.ref },
      );
    }
    byRef.set(a.ref, a.value);
  }

  const knownRefs = new Set(CHECKIN_QUESTIONS.map((q) => q.ref));
  for (const ref of byRef.keys()) {
    if (!knownRefs.has(ref)) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        `Unknown check-in question '${ref}'.`,
        { ref },
      );
    }
  }

  const answerMap: AnswerMap = {};
  const rows: AnswerRow[] = [];

  for (const q of CHECKIN_QUESTIONS) {
    if (!byRef.has(q.ref)) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        `Missing answer for question '${q.ref}'.`,
        { ref: q.ref },
      );
    }
    const value = byRef.get(q.ref);

    if (q.type === 'single') {
      const codes = new Set((q.options ?? []).map((o) => o.code));
      if (typeof value !== 'string' || !codes.has(value)) {
        throw invalidAnswer(q.ref);
      }
      answerMap[q.ref] = value;
      rows.push({ questionRef: q.ref, answerValue: value });
    } else if (q.type === 'multi') {
      const codes = new Set((q.options ?? []).map((o) => o.code));
      if (!Array.isArray(value) || value.length === 0) {
        throw invalidAnswer(q.ref);
      }
      for (const v of value) {
        if (typeof v !== 'string' || !codes.has(v)) {
          throw invalidAnswer(q.ref);
        }
      }
      answerMap[q.ref] = value as string[];
      for (const v of value as string[]) {
        rows.push({ questionRef: q.ref, answerValue: v });
      }
    } else {
      // scale — numeric, integer, within the inclusive range.
      const num = coerceInteger(value);
      const { min, max } = q.scale ?? { min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY };
      if (num === null || num < min || num > max) {
        throw invalidAnswer(q.ref);
      }
      answerMap[q.ref] = num;
      rows.push({ questionRef: q.ref, answerValue: String(num) });
    }
  }

  return { answerMap, rows };
}

function invalidAnswer(ref: string): AppError {
  return new AppError(
    ERROR_CODES.VALIDATION_ERROR,
    `Invalid answer for question '${ref}' — answers must be a declared code or a numeric in range (free text is not allowed).`,
    { ref },
  );
}

/** Coerce a number or numeric string to an integer; null when not integral. */
function coerceInteger(value: unknown): number | null {
  if (typeof value === 'number') return Number.isInteger(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isInteger(n) ? n : null;
  }
  return null;
}
