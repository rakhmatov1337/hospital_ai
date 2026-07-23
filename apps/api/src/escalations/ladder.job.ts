import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { EscalationStatus, Tier } from '@hospital-ai/shared-types';
import { Clock } from '../common/clock';
import { PrismaService } from '../prisma/prisma.service';
import { TelemetryService } from '../telemetry/telemetry.service';
import {
  ClinicHoursConfig,
  clinicLocalOffset,
  isWithinClinicHours,
} from '../checkins/clinic-hours';
import { EscalationsRepository } from './escalations.repository';
import {
  NOTIFICATION_CHANNEL,
  NotificationChannel,
} from './notification-channel';

const MS_PER_MINUTE = 60_000;

/** One rung of the ladder: which attempt, at what elapsed threshold, to whom. */
interface LadderStep {
  attemptNumber: number;
  thresholdMinutes: number;
  recipientRole: string;
}

/**
 * The escalation ladder (SP2 spec §5) — a plain deterministic scheduled poller,
 * NOT Mastra. The safety ladder must be maximally reliable, testable, and
 * dependency-free.
 *
 * Every minute, for each `new` Escalation it computes elapsed-since-`created_at`
 * and applies the due rungs using the clinic's own `notify/ack/breach` minutes:
 *
 *   attempt 1 (notify)  → on_duty
 *   attempt 2 (ack)     → backup      (on-duty repeat + backup)
 *   attempt 3 (breach)  → clinic_head + flip status to `breached`
 *
 * Each attempt appends an append-only `EscalationNotification` (via the channel)
 * with **zero clinical detail** and emits `escalation_notified`; the breach rung
 * additionally emits `escalation_breached`. Acknowledged/contacted/breached
 * escalations are skipped (the query only selects `new`) — so **acknowledge
 * halts the ladder**. Out of clinic hours a non-emergency places **no call**
 * (dashboard only); EMERGENCY notifications are unaffected. All time is read
 * through the injected {@link Clock} so tests drive it deterministically.
 */
@Injectable()
export class EscalationLadderJob {
  private readonly logger = new Logger(EscalationLadderJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: EscalationsRepository,
    @Inject(NOTIFICATION_CHANNEL)
    private readonly channel: NotificationChannel,
    private readonly telemetry: TelemetryService,
    private readonly clock: Clock,
  ) {}

  /** Runs each minute. Failures are logged, never thrown (the poller keeps going). */
  @Interval('escalation-ladder', MS_PER_MINUTE)
  async tick(): Promise<void> {
    try {
      await this.runOnce();
    } catch (err) {
      this.logger.error(
        'Escalation ladder tick failed.',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /**
   * One deterministic pass over every open (`new`) escalation. Extracted from the
   * interval so tests call it directly after advancing the clock.
   */
  async runOnce(): Promise<void> {
    const now = this.clock.now();

    // Escalation is NOT clinic-scoped by the tenancy extension, so the unscoped
    // client (correct for a global scheduled job) sees every clinic's queue.
    const open = await this.prisma.escalation.findMany({
      where: { status: EscalationStatus.new },
      include: {
        notifications: true,
        patient: { include: { clinic: true } },
      },
    });

    for (const esc of open) {
      await this.processOne(esc, now);
    }
  }

  private async processOne(
    esc: OpenEscalation,
    now: Date,
  ): Promise<void> {
    const clinic = esc.patient.clinic;
    const patientRef = esc.patient.patientRef;
    const isEmergency = esc.tier === Tier.emergency;
    const inHours = isWithinClinicHours(now, clinic as ClinicHoursConfig);
    const elapsedMs = now.getTime() - esc.createdAt.getTime();

    // Attempts already placed (append-only history) — never re-notify a rung.
    const placed = new Set(esc.notifications.map((n) => n.attemptNumber));

    for (const step of this.ladder(clinic)) {
      if (elapsedMs < step.thresholdMinutes * MS_PER_MINUTE) continue; // not due yet
      if (placed.has(step.attemptNumber)) continue; // already placed on a prior tick

      // Out of hours a non-emergency places NO call (dashboard only); the
      // escalation simply waits in the queue. EMERGENCY is unaffected.
      if (!inHours && !isEmergency) continue;

      await this.channel.send({
        escalationId: esc.id,
        patientRef,
        recipientRole: step.recipientRole,
        attemptNumber: step.attemptNumber,
      });

      const localOffset = clinicLocalOffset(now, clinic.timezone);
      await this.telemetry.emit(
        'escalation_notified',
        { attempt: step.attemptNumber, recipient_role: step.recipientRole },
        { clinicId: clinic.id, patientRef, localOffset, occurredAt: now },
      );

      // The final rung breaches: staff were never reached in time.
      if (step.attemptNumber === BREACH_ATTEMPT) {
        await this.repo.advanceStatus(esc.id, EscalationStatus.breached);
        await this.telemetry.emit(
          'escalation_breached',
          { tier: esc.tier },
          { clinicId: clinic.id, patientRef, localOffset, occurredAt: now },
        );
      }
    }
  }

  /** The clinic's ladder rungs, driven by its configured notify/ack/breach minutes. */
  private ladder(clinic: LadderClinic): LadderStep[] {
    return [
      { attemptNumber: 1, thresholdMinutes: clinic.notifyMinutes, recipientRole: 'on_duty' },
      { attemptNumber: 2, thresholdMinutes: clinic.ackMinutes, recipientRole: 'backup' },
      {
        attemptNumber: BREACH_ATTEMPT,
        thresholdMinutes: clinic.breachMinutes,
        recipientRole: 'clinic_head',
      },
    ];
  }
}

/** The breach rung is the 3rd/final attempt. */
const BREACH_ATTEMPT = 3;

/** Clinic fields the ladder reads (structurally satisfied by the Prisma `Clinic`). */
interface LadderClinic extends ClinicHoursConfig {
  id: string;
  notifyMinutes: number;
  ackMinutes: number;
  breachMinutes: number;
}

/** The escalation shape the pass needs (structurally satisfied by the Prisma include). */
interface OpenEscalation {
  id: string;
  tier: Tier | string;
  createdAt: Date;
  notifications: Array<{ attemptNumber: number }>;
  patient: { patientRef: string; clinic: LadderClinic };
}
