import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ERROR_CODES, TaskStatus } from '@hospital-ai/shared-types';
import { AppError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { TelemetryService } from '../telemetry/telemetry.service';

/**
 * Task lifecycle. Completion is idempotent (offline-sync retries must not
 * double-apply), and un-completion is an APPENDED audit event — the original
 * completion Event is never mutated or deleted. Escalation/telemetry are the
 * append-only spine; a Task row itself is mutable (not append-only), but its
 * audit trail in Event is append-only.
 */
@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telemetry: TelemetryService,
  ) {}

  /**
   * Complete a task. Idempotent on `idempotencyKey` (stored as the task's unique
   * `completion_key`): replaying the same key — or completing an already-completed
   * task — yields a single effect and returns the existing row without a second
   * mutation. A concurrent race is resolved by the unique constraint (P2002),
   * after which we return the already-applied row.
   *
   * `patientId` scopes the completion to a single patient (the authenticated
   * caller): a task belonging to another patient is treated as NOT_FOUND, so a
   * patient can neither complete nor probe for another patient's tasks. When
   * omitted (internal/test callers) the scope check is skipped.
   */
  async complete(taskId: string, idempotencyKey: string, patientId?: string) {
    if (!idempotencyKey || idempotencyKey.trim() === '') {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        'Idempotency-Key is required to complete a task.',
        { field: 'Idempotency-Key' },
      );
    }

    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { patient: { select: { clinicId: true, patientRef: true } } },
    });
    if (!task) {
      throw new AppError(ERROR_CODES.NOT_FOUND, `Task ${taskId} not found.`, { taskId });
    }
    // Patient scoping: another patient's task is indistinguishable from a missing one.
    if (patientId && task.patientId !== patientId) {
      throw new AppError(ERROR_CODES.NOT_FOUND, `Task ${taskId} not found.`, { taskId });
    }

    // Already completed => single-effect replay. No second mutation, no second event.
    if (task.status === TaskStatus.completed) {
      return task;
    }

    const now = new Date();
    const onTime = now.getTime() <= task.windowClosesAt.getTime();

    try {
      const updated = await this.prisma.task.update({
        where: { id: taskId },
        data: {
          status: TaskStatus.completed,
          completedAt: now,
          onTime,
          completionKey: idempotencyKey,
        },
        include: { patient: { select: { clinicId: true, patientRef: true } } },
      });

      await this.telemetry.emit(
        'task_completed',
        {
          task_type: updated.taskType,
          recovery_day: updated.recoveryDay,
          on_time: onTime,
        },
        {
          clinicId: updated.patient.clinicId,
          patientRef: updated.patient.patientRef,
          recoveryDay: updated.recoveryDay,
        },
      );

      return updated;
    } catch (err) {
      // Unique violation on completion_key => a concurrent request with the same
      // key already applied the effect. Return the already-completed row.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return this.prisma.task.findUniqueOrThrow({
          where: { id: taskId },
          include: { patient: { select: { clinicId: true, patientRef: true } } },
        });
      }
      throw err;
    }
  }

  /**
   * Un-complete a task (correction). The Task row reverts to pending, but the
   * original `task_completed` Event is NEVER mutated or removed — instead a NEW
   * `task_uncompleted` Event is appended, preserving the full audit trail.
   */
  async uncomplete(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { patient: { select: { clinicId: true, patientRef: true } } },
    });
    if (!task) {
      throw new AppError(ERROR_CODES.NOT_FOUND, `Task ${taskId} not found.`, { taskId });
    }
    if (task.status !== TaskStatus.completed) {
      // Nothing to undo; single-effect / no-op.
      return task;
    }

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.pending,
        completedAt: null,
        onTime: null,
        completionKey: null,
      },
      include: { patient: { select: { clinicId: true, patientRef: true } } },
    });

    // Append a NEW event — the original completion event is left untouched.
    await this.telemetry.emit(
      'task_uncompleted',
      {
        task_type: updated.taskType,
        recovery_day: updated.recoveryDay,
      },
      {
        clinicId: updated.patient.clinicId,
        patientRef: updated.patient.patientRef,
        recoveryDay: updated.recoveryDay,
      },
    );

    return updated;
  }
}
