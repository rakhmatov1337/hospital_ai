import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { TaskStatus } from '@hospital-ai/shared-types';
import { Clock } from '../common/clock';
import { PrismaService } from '../prisma/prisma.service';
import { TelemetryService } from '../telemetry/telemetry.service';

/**
 * Server-side `task_missed` sweep (SP2 design §6).
 *
 * A disengaged patient emits no client events — yet they are exactly the patient
 * who matters most (they drive the D4 attention flag: no activity 3+ days /
 * adherence <50%). So "missed" cannot be a client concern: this scheduled job
 * marks a {@link https://nestjs.com | NestJS} `Task` as `missed` (and
 * `on_time = false`) once its `window_closes_at` has passed while still
 * uncompleted, and appends a categorical `task_missed` telemetry Event.
 *
 * Determinism: "now" is read through the injected {@link Clock}, so a test can
 * pin/advance time and prove an overdue task flips to `missed` server-side —
 * without any patient action. Completed and already-missed tasks are never
 * touched (only `pending` rows are candidates), so the sweep is idempotent
 * across overlapping runs.
 */
@Injectable()
export class TaskMissedJob {
  private readonly logger = new Logger(TaskMissedJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telemetry: TelemetryService,
    private readonly clock: Clock,
  ) {}

  /** Runs every minute; the real work lives in {@link sweep} for testability. */
  @Interval('task-missed-sweep', 60_000)
  async handleInterval(): Promise<void> {
    try {
      await this.sweep();
    } catch (err) {
      // A scheduled sweep must never crash the process; log and retry next tick.
      this.logger.error(
        `task_missed sweep failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Flip every overdue-uncompleted task to `missed`/`on_time=false` and emit a
   * categorical `task_missed` Event for each. Returns the number of tasks marked
   * so callers/tests can assert the effect. Only `pending` tasks whose window has
   * already closed (`window_closes_at <= now`) are candidates — `completed` and
   * `missed` rows are left untouched, and future windows are excluded.
   */
  async sweep(): Promise<number> {
    const now = this.clock.now();

    const overdue = await this.prisma.task.findMany({
      where: {
        status: TaskStatus.pending,
        windowClosesAt: { lte: now },
      },
      include: {
        patient: { select: { clinicId: true, patientRef: true } },
      },
    });

    let marked = 0;
    for (const task of overdue) {
      // Guard the transition with the same predicate in the WHERE clause so a
      // concurrent completion (task flipped to `completed` between the read and
      // the write) is not clobbered back to `missed`.
      const result = await this.prisma.task.updateMany({
        where: { id: task.id, status: TaskStatus.pending },
        data: { status: TaskStatus.missed, onTime: false },
      });
      if (result.count === 0) continue; // lost the race; skip telemetry.

      await this.telemetry.emit(
        'task_missed',
        {
          task_type: task.taskType,
          recovery_day: task.recoveryDay,
          on_time: false,
        },
        {
          clinicId: task.patient.clinicId,
          patientRef: task.patient.patientRef,
          recoveryDay: task.recoveryDay,
          occurredAt: now,
        },
      );
      marked += 1;
    }

    return marked;
  }
}
