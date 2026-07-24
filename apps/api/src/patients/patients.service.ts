import { Injectable } from '@nestjs/common';
import {
  AdherencePoint,
  CheckInHistoryItem,
  ConsentRecord,
  ERROR_CODES,
  EscalationHistoryItem,
  EscalationStatus,
  Language,
  PatientDetailView,
  PatientListItem,
  PatientListPage,
  PatientStatus,
  ReissueCodeResult,
  TaskHistoryItem,
  TaskStatus,
  TaskType,
  Tier,
  WithdrawPatientResult,
} from '@hospital-ai/shared-types';
import { AppError } from '../common/errors';
import { Clock } from '../common/clock';
import { RequestContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { recoveryDay } from '../plans/recovery-day';
import {
  AdherenceTaskRow,
  computeAdherence,
  groupAdherence,
} from '../telemetry/metrics.service';
import {
  CODE_LENGTH,
  CODE_TTL_DAYS,
  randomFromAlphabet,
} from './enrolment.service';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ATTENTION_ADHERENCE = 0.5; // < 50% adherence flags for attention
const ATTENTION_INACTIVE_DAYS = 3; // no activity for 3+ days flags for attention
const MAX_CODE_ATTEMPTS = 12;

/** Minimal task shape the enrichment math needs. */
interface TaskRow {
  taskType: string;
  status: string;
  onTime: boolean | null;
  windowClosesAt: Date;
  recoveryDay: number;
  completedAt: Date | null;
}

/** Aggregate derived from a patient's tasks / check-ins / escalations. */
interface PatientEnrichment {
  adherence: number | null;
  adherenceNumerator: number;
  adherenceDenominator: number;
  lastActive: Date | null;
  openEscalations: number;
  attentionFlag: boolean;
}

/**
 * Clinic-scoped patient reads + lifecycle actions (staff · D4/D5).
 *
 * The list uses the tenancy-scoped client (`prisma.forClinic`) so `where:{ clinic_id }`
 * is injected at the repository layer — a forgotten controller filter cannot leak
 * another clinic's patients. The by-id paths (`findUnique`, deliberately excluded
 * from blanket auto-scoping) are validated explicitly here: another clinic's patient
 * yields `CROSS_CLINIC_FORBIDDEN`.
 *
 * Every list/detail row is ENRICHED server-side (adherence %, last-active,
 * open-escalation count, attention flag) so the dashboard renders the D4 attention
 * flags without deriving clinical judgement client-side. Adherence reuses the
 * MetricsService formula (completed-on-time ÷ window-closed assigned; future tasks
 * excluded).
 */
@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly clock: Clock,
  ) {}

  async list(cursor?: string, limit?: number): Promise<PatientListPage> {
    const clinicId = this.ctx.requireClinicId();
    const take = Math.min(Math.max(limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const now = this.clock.now();
    const timezone = await this.clinicTimezone(clinicId);

    const scoped = this.prisma.forClinic(clinicId) as unknown as PrismaService;

    const rows = await scoped.patient.findMany({
      take: take + 1,
      orderBy: { id: 'asc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        tasks: {
          select: {
            taskType: true,
            status: true,
            onTime: true,
            windowClosesAt: true,
            recoveryDay: true,
            completedAt: true,
          },
        },
        checkIns: { select: { submittedAt: true }, orderBy: { submittedAt: 'desc' }, take: 1 },
        escalations: { select: { status: true } },
      },
    });

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    return {
      items: page.map((p) => this.toListItem(p, now, timezone)),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async get(id: string): Promise<PatientDetailView> {
    const clinicId = this.ctx.requireClinicId();
    const now = this.clock.now();
    const timezone = await this.clinicTimezone(clinicId);

    const patient = await this.prisma.patient.findUnique({
      where: { id },
      include: {
        tasks: {
          orderBy: [{ recoveryDay: 'asc' }, { scheduledFor: 'asc' }],
        },
        checkIns: {
          orderBy: { submittedAt: 'desc' },
          include: { escalation: { select: { status: true, outcomeCode: true } } },
        },
        escalations: { orderBy: { createdAt: 'desc' } },
        consents: { orderBy: { acceptedAt: 'desc' }, take: 1 },
      },
    });
    if (!patient) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Patient not found.', { id });
    }
    if (patient.clinicId !== clinicId) {
      throw new AppError(
        ERROR_CODES.CROSS_CLINIC_FORBIDDEN,
        'This patient belongs to another clinic.',
      );
    }

    const taskRows: TaskRow[] = patient.tasks.map((t) => ({
      taskType: t.taskType,
      status: t.status,
      onTime: t.onTime,
      windowClosesAt: t.windowClosesAt,
      recoveryDay: t.recoveryDay,
      completedAt: t.completedAt,
    }));

    const enrichment = this.enrich(
      taskRows,
      patient.checkIns.map((c) => c.submittedAt),
      patient.escalations.map((e) => e.status),
      now,
      recoveryDay(patient.dischargeDate, now, timezone),
    );

    const byDay = groupAdherence(
      taskRows.map(toAdherenceRow),
      now,
      (t) => t.recoveryDay,
    );
    const adherenceOverTime: AdherencePoint[] = Object.entries(byDay)
      .map(([day, d]) => ({
        recoveryDay: Number(day),
        value: d.value,
        numerator: d.numerator,
        denominator: d.denominator,
      }))
      .sort((a, b) => a.recoveryDay - b.recoveryDay);

    const taskHistory: TaskHistoryItem[] = patient.tasks.map((t) => ({
      id: t.id,
      taskType: t.taskType as TaskType,
      recoveryDay: t.recoveryDay,
      scheduledFor: t.scheduledFor.toISOString(),
      windowClosesAt: t.windowClosesAt.toISOString(),
      status: t.status as TaskStatus,
      onTime: t.onTime,
      completedAt: iso(t.completedAt),
    }));

    const checkIns: CheckInHistoryItem[] = patient.checkIns.map((c) => ({
      id: c.id,
      submittedAt: c.submittedAt.toISOString(),
      recoveryDay: c.recoveryDay,
      tier: (c.tierAssigned as Tier | null) ?? null,
      outcomeCode: c.escalation?.outcomeCode ?? null,
      escalationStatus: (c.escalation?.status as EscalationStatus | undefined) ?? null,
    }));

    const escalations: EscalationHistoryItem[] = patient.escalations.map((e) => ({
      id: e.id,
      tier: e.tier as Tier,
      status: e.status as EscalationStatus,
      outcomeCode: e.outcomeCode,
      createdAt: e.createdAt.toISOString(),
    }));

    const consent: ConsentRecord | null = patient.consents[0]
      ? {
          version: patient.consents[0].version,
          acceptedAt: patient.consents[0].acceptedAt.toISOString(),
        }
      : null;

    return {
      id: patient.id,
      patientRef: patient.patientRef,
      name: patient.name,
      phone: patient.phone,
      ageBand: patient.ageBand,
      status: patient.status as PatientStatus,
      language: patient.language as Language,
      procedureType: patient.procedureType,
      dischargeDate: patient.dischargeDate.toISOString(),
      recoveryDay: recoveryDay(patient.dischargeDate, now, timezone),
      planId: patient.planId,
      enrolmentCode: patient.enrolmentCode,
      codeExpiresAt: iso(patient.codeExpiresAt),
      consentVersion: patient.consentVersion,
      consentedAt: iso(patient.consentedAt),
      adherence: enrichment.adherence,
      adherenceNumerator: enrichment.adherenceNumerator,
      adherenceDenominator: enrichment.adherenceDenominator,
      lastActive: iso(enrichment.lastActive),
      openEscalations: enrichment.openEscalations,
      attentionFlag: enrichment.attentionFlag,
      adherenceOverTime,
      taskHistory,
      checkIns,
      escalations,
      consent,
    };
  }

  /**
   * Re-issue the patient's enrolment code (D5). Invalidates the old code by
   * replacing it with a fresh single-use 6-char code and a 14-day expiry. Refused
   * for a withdrawn patient. The write goes through the tenancy-scoped client so it
   * can only ever touch a patient in the authenticated clinic.
   */
  async reissueCode(id: string): Promise<ReissueCodeResult> {
    const clinicId = this.ctx.requireClinicId();
    const patient = await this.loadOwned(id, clinicId);
    if (patient.status === PatientStatus.withdrawn) {
      throw new AppError(
        ERROR_CODES.INVALID_STATUS_TRANSITION,
        'Cannot re-issue an enrolment code for a withdrawn patient.',
        { id },
      );
    }

    const now = this.clock.now();
    const enrolmentCode = await this.allocateEnrolmentCode();
    const codeExpiresAt = new Date(now.getTime() + CODE_TTL_DAYS * MS_PER_DAY);

    const scoped = this.prisma.forClinic(clinicId) as unknown as PrismaService;
    await scoped.patient.updateMany({
      where: { id },
      data: { enrolmentCode, codeExpiresAt },
    });

    return { patientId: id, enrolmentCode, codeExpiresAt: codeExpiresAt.toISOString() };
  }

  /**
   * Withdraw a patient (D5). Stops future tasks/reminders by deleting still-pending
   * tasks whose window has not yet closed, RETAINS all history (completed/missed
   * tasks, check-ins, escalations, consent) and flags the patient `withdrawn`.
   * Idempotent: withdrawing an already-withdrawn patient stops nothing further.
   */
  async withdraw(id: string): Promise<WithdrawPatientResult> {
    const clinicId = this.ctx.requireClinicId();
    const patient = await this.loadOwned(id, clinicId);

    if (patient.status === PatientStatus.withdrawn) {
      return { patientId: id, status: PatientStatus.withdrawn, tasksStopped: 0 };
    }

    const now = this.clock.now();
    // Only future (not-yet-closed) pending tasks are removed — history is retained.
    const removed = await this.prisma.task.deleteMany({
      where: { patientId: id, status: 'pending', windowClosesAt: { gt: now } },
    });

    const scoped = this.prisma.forClinic(clinicId) as unknown as PrismaService;
    await scoped.patient.updateMany({
      where: { id },
      data: { status: PatientStatus.withdrawn },
    });

    return {
      patientId: id,
      status: PatientStatus.withdrawn,
      tasksStopped: removed.count,
    };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async loadOwned(id: string, clinicId: string) {
    const patient = await this.prisma.patient.findUnique({ where: { id } });
    if (!patient) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Patient not found.', { id });
    }
    if (patient.clinicId !== clinicId) {
      throw new AppError(
        ERROR_CODES.CROSS_CLINIC_FORBIDDEN,
        'This patient belongs to another clinic.',
      );
    }
    return patient;
  }

  private async clinicTimezone(clinicId: string): Promise<string> {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { timezone: true },
    });
    return clinic?.timezone ?? 'UTC';
  }

  private toListItem(
    p: {
      id: string;
      patientRef: string;
      name: string;
      status: string;
      language: string;
      procedureType: string;
      dischargeDate: Date;
      createdAt: Date;
      tasks: TaskRow[];
      checkIns: Array<{ submittedAt: Date }>;
      escalations: Array<{ status: string }>;
    },
    now: Date,
    timezone: string,
  ): PatientListItem {
    const day = recoveryDay(p.dischargeDate, now, timezone);
    const enrichment = this.enrich(
      p.tasks,
      p.checkIns.map((c) => c.submittedAt),
      p.escalations.map((e) => e.status),
      now,
      day,
    );
    return {
      id: p.id,
      patientRef: p.patientRef,
      name: p.name,
      status: p.status as PatientStatus,
      language: p.language as Language,
      procedureType: p.procedureType,
      dischargeDate: p.dischargeDate.toISOString(),
      recoveryDay: day,
      adherence: enrichment.adherence,
      adherenceNumerator: enrichment.adherenceNumerator,
      adherenceDenominator: enrichment.adherenceDenominator,
      lastActive: iso(enrichment.lastActive),
      openEscalations: enrichment.openEscalations,
      attentionFlag: enrichment.attentionFlag,
      createdAt: p.createdAt.toISOString(),
    };
  }

  /**
   * Derive the enriched fields for one patient. Adherence uses the MetricsService
   * formula (completed-on-time ÷ window-closed assigned; future tasks excluded).
   * `attentionFlag` = adherence < 50% OR no activity for 3+ days (a never-active
   * patient counts as inactive only once past recovery day 3, so a freshly-enrolled
   * patient is not flagged on day 0).
   */
  private enrich(
    tasks: TaskRow[],
    checkInTimes: Date[],
    escalationStatuses: string[],
    now: Date,
    day: number,
  ): PatientEnrichment {
    const adherence = computeAdherence(tasks.map(toAdherenceRow), now);

    const lastCompletion = tasks
      .map((t) => t.completedAt)
      .filter((d): d is Date => d !== null)
      .reduce<Date | null>((max, d) => (max === null || d > max ? d : max), null);
    const lastCheckIn = checkInTimes.reduce<Date | null>(
      (max, d) => (max === null || d > max ? d : max),
      null,
    );
    const lastActive =
      lastCompletion && lastCheckIn
        ? lastCompletion > lastCheckIn
          ? lastCompletion
          : lastCheckIn
        : (lastCompletion ?? lastCheckIn);

    const openEscalations = escalationStatuses.filter(
      (s) => s !== EscalationStatus.contacted,
    ).length;

    const lowAdherence = adherence.value !== null && adherence.value < ATTENTION_ADHERENCE;
    const inactive =
      lastActive === null
        ? day >= ATTENTION_INACTIVE_DAYS
        : now.getTime() - lastActive.getTime() >= ATTENTION_INACTIVE_DAYS * MS_PER_DAY;

    return {
      adherence: adherence.value,
      adherenceNumerator: adherence.numerator,
      adherenceDenominator: adherence.denominator,
      lastActive,
      openEscalations,
      attentionFlag: lowAdherence || inactive,
    };
  }

  private async allocateEnrolmentCode(): Promise<string> {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const code = randomFromAlphabet(CODE_LENGTH);
      const clash = await this.prisma.patient.findUnique({
        where: { enrolmentCode: code },
        select: { id: true },
      });
      if (!clash) return code;
    }
    throw new AppError(
      ERROR_CODES.INTERNAL_ERROR,
      'Could not allocate a unique enrolment code.',
    );
  }
}

/** Map a task row to the shape the adherence math needs. */
function toAdherenceRow(t: TaskRow): AdherenceTaskRow {
  return {
    taskType: t.taskType,
    status: t.status,
    onTime: t.onTime,
    windowClosesAt: t.windowClosesAt,
    recoveryDay: t.recoveryDay,
  };
}

/** ISO string or null for a nullable Date. */
function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}
