import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ERROR_CODES,
  EscalationStatus,
  Tier,
} from '@hospital-ai/shared-types';
import { AppError } from '../common/errors';
import { Clock } from '../common/clock';
import { RequestContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { TelemetryService } from '../telemetry/telemetry.service';
import { clinicLocalOffset } from '../checkins/clinic-hours';
import {
  EscalationsRepository,
  assertForwardTransition,
} from './escalations.repository';
import { ContactEscalationDto } from './dto/contact-escalation.dto';
import { EscalationFilter } from './dto/list-escalations.dto';

const MS_PER_MINUTE = 60_000;

// ---------------------------------------------------------------------------
// Response shapes (staff queue / detail / actions)
// ---------------------------------------------------------------------------

/** One row in the staff queue. */
export interface EscalationQueueItem {
  id: string;
  tier: string;
  status: string;
  patientRef: string;
  patientName: string;
  recoveryDay: number | null;
  createdAt: Date;
  /** Whole minutes since the escalation was created (clock-driven). */
  elapsedMinutes: number;
  /** Latest activity: the most recent notification, else creation. */
  lastUpdated: Date;
}

/** The queue: tier sections, never paginated. */
export interface EscalationQueue {
  filter: EscalationFilter;
  total: number;
  sections: {
    emergency: EscalationQueueItem[];
    urgent: EscalationQueueItem[];
    routine: EscalationQueueItem[];
  };
}

/** One appended notification attempt (no clinical detail — role/attempt/channel only). */
export interface NotificationTimelineItem {
  attemptNumber: number;
  recipientRole: string;
  channel: string;
  sentAt: Date;
  delivered: boolean;
}

/** One prior check-in in the patient's recent history. */
export interface RecentCheckIn {
  id: string;
  submittedAt: Date;
  recoveryDay: number;
  tier: string | null;
}

/** Adherence snapshot over tasks whose window has closed (excludes future tasks). */
export interface AdherenceSnapshot {
  completedOnTime: number;
  assignedWindowClosed: number;
  /** completedOnTime ÷ assignedWindowClosed, or null when the denominator is 0. */
  ratio: number | null;
}

/** Full staff detail for one escalation. */
export interface EscalationDetail {
  id: string;
  tier: string;
  status: string;
  outcomeCode: string | null;
  /** Staff-only clinical note — never surfaced to a patient client. */
  clinicalNote: string | null;
  createdAt: Date;
  /** The deciding tier rule set version (from the check-in). */
  ruleVersion: string;
  patient: {
    patientRef: string;
    name: string;
    ageBand: string;
    procedureType: string;
    dischargeDate: Date;
    recoveryDay: number;
    phone: string;
  };
  /** The check-in answers VERBATIM (categorical/numeric only). */
  answers: Array<{ questionRef: string; answerValue: string }>;
  notifications: NotificationTimelineItem[];
  recentCheckIns: RecentCheckIn[];
  adherence: AdherenceSnapshot;
}

/** Result of an acknowledge/contact action. */
export interface EscalationActionResult {
  id: string;
  status: string;
  outcomeCode?: string | null;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Staff escalation queue, detail, and the two forward-only actions (SP2 spec §7).
 *
 * All reads are clinic-scoped by joining `patient.clinicId` to the authenticated
 * clinic (Escalation is not auto-scoped by the tenancy extension). The queue
 * NEVER paginates, collapses, or hides an unresolved item. Status only ever moves
 * forward (`new → acknowledged → contacted`, or `→ breached` by the ladder) — an
 * escalation can never be edited, deleted, or dismissed without an outcome.
 */
@Injectable()
export class EscalationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly repo: EscalationsRepository,
    private readonly telemetry: TelemetryService,
    private readonly clock: Clock,
  ) {}

  /**
   * The staff queue, ordered tier-then-age and split into sections. `unresolved`
   * (default) hides only fully-closed (`contacted`) escalations; everything still
   * needing attention — new, acknowledged, AND breached — always appears. There
   * is no pagination, so an unresolved urgent item can never be pushed off a page.
   */
  async queue(filter: EscalationFilter = 'unresolved'): Promise<EscalationQueue> {
    const clinicId = this.ctx.requireClinicId();

    const where: Prisma.EscalationWhereInput = { patient: { clinicId } };
    if (filter !== 'all') {
      // Unresolved = not yet closed with an outcome. Breached stays visible.
      where.status = { not: EscalationStatus.contacted };
    }

    const rows = await this.prisma.escalation.findMany({
      where,
      include: {
        patient: { select: { patientRef: true, name: true } },
        checkIn: { select: { recoveryDay: true } },
        notifications: { select: { sentAt: true } },
      },
    });

    const now = this.clock.now();
    const items = rows
      .map((r) => this.toQueueItem(r, now))
      // Tier first (emergency > urgent > routine), then oldest-first within a tier.
      .sort(
        (a, b) =>
          tierRank(b.tier) - tierRank(a.tier) ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      );

    return {
      filter,
      total: items.length,
      sections: {
        emergency: items.filter((i) => i.tier === Tier.emergency),
        urgent: items.filter((i) => i.tier === Tier.urgent),
        routine: items.filter((i) => i.tier === Tier.routine),
      },
    };
  }

  /** Full detail: patient, verbatim answers, deciding rule, timeline, recent history. */
  async detail(id: string): Promise<EscalationDetail> {
    const esc = await this.prisma.escalation.findUnique({
      where: { id },
      include: {
        patient: { include: { clinic: { select: { id: true } } } },
        checkIn: { include: { answers: true } },
        notifications: true,
      },
    });
    if (!esc) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Escalation not found.', { id });
    }
    this.assertOwned(esc.patient.clinicId);

    const patient = esc.patient;
    const checkIn = esc.checkIn;

    const recent = await this.prisma.checkIn.findMany({
      where: { patientId: patient.id },
      orderBy: { submittedAt: 'desc' },
      take: 5,
      select: { id: true, submittedAt: true, recoveryDay: true, tierAssigned: true },
    });

    const adherence = await this.computeAdherence(patient.id);

    return {
      id: esc.id,
      tier: esc.tier,
      status: esc.status,
      outcomeCode: esc.outcomeCode,
      clinicalNote: esc.clinicalNote,
      createdAt: esc.createdAt,
      ruleVersion: checkIn.ruleVersion,
      patient: {
        patientRef: patient.patientRef,
        name: patient.name,
        ageBand: patient.ageBand,
        procedureType: patient.procedureType,
        dischargeDate: patient.dischargeDate,
        recoveryDay: checkIn.recoveryDay,
        phone: patient.phone,
      },
      answers: checkIn.answers.map((a) => ({
        questionRef: a.questionRef,
        answerValue: a.answerValue,
      })),
      notifications: [...esc.notifications]
        .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())
        .map((n) => ({
          attemptNumber: n.attemptNumber,
          recipientRole: n.recipientRole,
          channel: n.channel,
          sentAt: n.sentAt,
          delivered: n.delivered,
        })),
      recentCheckIns: recent.map((c) => ({
        id: c.id,
        submittedAt: c.submittedAt,
        recoveryDay: c.recoveryDay,
        tier: c.tierAssigned ?? null,
      })),
      adherence,
    };
  }

  /**
   * Acknowledge — forward-only `new → acknowledged`, which HALTS the ladder (the
   * ladder only advances `new` escalations). First-ack-wins: a second caller finds
   * the escalation already advanced and is told its current status (409), never a
   * silent re-acknowledge.
   */
  async acknowledge(id: string): Promise<EscalationActionResult> {
    const esc = await this.loadOwned(id);

    if (esc.status !== EscalationStatus.new) {
      throw new AppError(
        ERROR_CODES.DUPLICATE_REQUEST,
        `Escalation is already ${esc.status}.`,
        { id, status: esc.status },
      );
    }

    // The repository's advanceStatus is the single controlled forward-only path.
    const updated = await this.repo.advanceStatus(id, EscalationStatus.acknowledged);

    await this.emitAction(esc, 'escalation_acknowledged', { tier: esc.tier });

    return { id: updated.id, status: updated.status };
  }

  /**
   * Contact — records the patient-contact OUTCOME and moves the escalation to
   * `contacted`. The outcome is required (DTO), so an escalation can never be
   * closed without one. Status/outcome/note are written together through a single
   * controlled statement (the ORM `escalation.update` surface is sealed by the
   * append-only guard); a forward-only precondition on the WHERE clause makes the
   * move atomic and idempotent-safe.
   */
  async contact(
    id: string,
    dto: ContactEscalationDto,
  ): Promise<EscalationActionResult> {
    const esc = await this.loadOwned(id);

    // Validate the forward move (new|acknowledged → contacted) before any write.
    assertForwardTransition(esc.status as EscalationStatus, EscalationStatus.contacted);

    const affected = await this.prisma.$executeRaw(
      Prisma.sql`
        UPDATE "escalation"
           SET "status" = 'contacted'::"EscalationStatus",
               "outcome_code" = ${dto.outcomeCode},
               "clinical_note" = ${dto.clinicalNote ?? null}
         WHERE "id" = ${id}
           AND "status" IN ('new'::"EscalationStatus", 'acknowledged'::"EscalationStatus")
      `,
    );

    if (affected === 0) {
      // Someone advanced it between our read and write — report the real state.
      const current = await this.prisma.escalation.findUnique({
        where: { id },
        select: { status: true },
      });
      throw new AppError(
        ERROR_CODES.INVALID_STATUS_TRANSITION,
        `Escalation can no longer be contacted (status ${current?.status ?? 'unknown'}).`,
        { id, status: current?.status ?? null },
      );
    }

    await this.emitAction(esc, 'escalation_patient_contacted', {
      outcome: dto.outcomeCode,
    });

    return { id, status: EscalationStatus.contacted, outcomeCode: dto.outcomeCode };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /** Load an escalation and assert it belongs to the authenticated clinic. */
  private async loadOwned(id: string): Promise<OwnedEscalation> {
    const esc = await this.prisma.escalation.findUnique({
      where: { id },
      include: {
        patient: { include: { clinic: { select: { id: true, timezone: true } } } },
      },
    });
    if (!esc) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Escalation not found.', { id });
    }
    this.assertOwned(esc.patient.clinicId);
    return esc;
  }

  private assertOwned(patientClinicId: string): void {
    const clinicId = this.ctx.requireClinicId();
    if (patientClinicId !== clinicId) {
      throw new AppError(
        ERROR_CODES.CROSS_CLINIC_FORBIDDEN,
        'This escalation belongs to another clinic.',
      );
    }
  }

  /** Emit a categorical action event (clinic + patientRef context, no clinical detail). */
  private async emitAction(
    esc: OwnedEscalation,
    eventName: string,
    payload: Record<string, string | number | boolean | null>,
  ): Promise<void> {
    const now = this.clock.now();
    await this.telemetry.emit(eventName, payload, {
      clinicId: esc.patient.clinic.id,
      patientRef: esc.patient.patientRef,
      localOffset: clinicLocalOffset(now, esc.patient.clinic.timezone),
      occurredAt: now,
    });
  }

  /**
   * Adherence over tasks whose window has already closed (future tasks excluded):
   * completed-on-time ÷ assigned-where-window-closed. Denominator is always
   * returned; a 0 denominator yields a null ratio (never a divide-by-zero).
   */
  private async computeAdherence(patientId: string): Promise<AdherenceSnapshot> {
    const now = this.clock.now();

    const assignedWindowClosed = await this.prisma.task.count({
      where: { patientId, windowClosesAt: { lte: now } },
    });
    const completedOnTime = await this.prisma.task.count({
      where: { patientId, windowClosesAt: { lte: now }, status: 'completed', onTime: true },
    });

    return {
      completedOnTime,
      assignedWindowClosed,
      ratio: assignedWindowClosed === 0 ? null : completedOnTime / assignedWindowClosed,
    };
  }

  private toQueueItem(row: QueueRow, now: Date): EscalationQueueItem {
    const lastNotification = row.notifications.reduce<Date | null>(
      (latest, n) => (latest === null || n.sentAt > latest ? n.sentAt : latest),
      null,
    );
    const lastUpdated =
      lastNotification && lastNotification > row.createdAt ? lastNotification : row.createdAt;

    return {
      id: row.id,
      tier: row.tier,
      status: row.status,
      patientRef: row.patient.patientRef,
      patientName: row.patient.name,
      recoveryDay: row.checkIn?.recoveryDay ?? null,
      createdAt: row.createdAt,
      elapsedMinutes: Math.floor((now.getTime() - row.createdAt.getTime()) / MS_PER_MINUTE),
      lastUpdated,
    };
  }
}

// ---------------------------------------------------------------------------
// Internal row shapes (structurally satisfied by the Prisma includes above)
// ---------------------------------------------------------------------------

interface OwnedEscalation {
  id: string;
  tier: string;
  status: string;
  patient: {
    clinicId: string;
    patientRef: string;
    clinic: { id: string; timezone: string };
  };
}

interface QueueRow {
  id: string;
  tier: string;
  status: string;
  createdAt: Date;
  patient: { patientRef: string; name: string };
  checkIn: { recoveryDay: number } | null;
  notifications: Array<{ sentAt: Date }>;
}

/** Tier ordering for the queue: emergency (3) > urgent (2) > routine (1). */
function tierRank(tier: string): number {
  if (tier === Tier.emergency) return 3;
  if (tier === Tier.urgent) return 2;
  if (tier === Tier.routine) return 1;
  return 0;
}
