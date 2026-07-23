import { TaskStatus } from '@hospital-ai/shared-types';
import { AppError } from '../common/errors';
import { TasksService } from './tasks.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TelemetryService } from '../telemetry/telemetry.service';

/**
 * A minimal in-memory Task store standing in for PrismaService. It records how
 * many times `update` runs so we can prove idempotency = a single effect.
 */
function makeFakePrisma(initialTask: Record<string, unknown>) {
  const store = new Map<string, Record<string, unknown>>();
  store.set(initialTask.id as string, { ...initialTask });
  let updateCalls = 0;

  const prisma = {
    task: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        const row = store.get(where.id);
        return row ? { ...row } : null;
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: { where: { id: string } }) => {
        const row = store.get(where.id);
        if (!row) throw new Error('not found');
        return { ...row };
      }),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          updateCalls += 1;
          const row = { ...store.get(where.id), ...data };
          store.set(where.id, row);
          return { ...row };
        },
      ),
    },
  };

  return { prisma, updateCalls: () => updateCalls };
}

describe('TasksService.complete idempotency', () => {
  const patient = { clinicId: 'clinic-1', patientRef: 'DEMO-01' };
  const baseTask = {
    id: 'task-1',
    taskType: 'medication',
    recoveryDay: 6,
    status: TaskStatus.pending,
    completedAt: null,
    onTime: null,
    completionKey: null,
    windowClosesAt: new Date(Date.now() + 60 * 60 * 1000), // 1h in the future
    patient,
  };

  it('applies a single effect when the same Idempotency-Key is replayed', async () => {
    const { prisma, updateCalls } = makeFakePrisma(baseTask);
    const emit = jest.fn(async () => undefined);
    const service = new TasksService(
      prisma as unknown as PrismaService,
      { emit } as unknown as TelemetryService,
    );

    const first = await service.complete('task-1', 'KEY-1');
    expect(first.status).toBe(TaskStatus.completed);
    expect(first.completionKey).toBe('KEY-1');
    expect(first.onTime).toBe(true);

    const second = await service.complete('task-1', 'KEY-1');
    expect(second.status).toBe(TaskStatus.completed);

    // Single effect: exactly one write, exactly one telemetry event.
    expect(updateCalls()).toBe(1);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('does not re-complete an already-completed task on a different key', async () => {
    const { prisma, updateCalls } = makeFakePrisma(baseTask);
    const emit = jest.fn(async () => undefined);
    const service = new TasksService(
      prisma as unknown as PrismaService,
      { emit } as unknown as TelemetryService,
    );

    await service.complete('task-1', 'KEY-1');
    await service.complete('task-1', 'KEY-2');

    expect(updateCalls()).toBe(1);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing Idempotency-Key', async () => {
    const { prisma } = makeFakePrisma(baseTask);
    const emit = jest.fn(async () => undefined);
    const service = new TasksService(
      prisma as unknown as PrismaService,
      { emit } as unknown as TelemetryService,
    );

    await expect(service.complete('task-1', '')).rejects.toBeInstanceOf(AppError);
    expect(emit).not.toHaveBeenCalled();
  });
});
