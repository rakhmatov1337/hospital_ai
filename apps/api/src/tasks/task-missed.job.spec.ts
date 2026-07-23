import { TaskStatus } from '@hospital-ai/shared-types';
import { FixedClock } from '../common/clock';
import { TaskMissedJob } from './task-missed.job';
import type { PrismaService } from '../prisma/prisma.service';
import type { TelemetryService } from '../telemetry/telemetry.service';

/**
 * In-memory Task store standing in for PrismaService. `findMany` filters on the
 * pending-status + `windowClosesAt <= now` predicate the job uses, and
 * `updateMany` honours its WHERE guard so we can prove the concurrent-completion
 * race is not clobbered.
 */
function makeFakePrisma(tasks: Array<Record<string, unknown>>) {
  const store = new Map<string, Record<string, unknown>>();
  for (const t of tasks) store.set(t.id as string, { ...t });
  let updateManyCalls = 0;

  const prisma = {
    task: {
      findMany: jest.fn(
        async ({
          where,
        }: {
          where: { status: string; windowClosesAt: { lte: Date } };
        }) => {
          const rows: Array<Record<string, unknown>> = [];
          for (const row of store.values()) {
            const closesAt = row.windowClosesAt as Date;
            if (
              row.status === where.status &&
              closesAt.getTime() <= where.windowClosesAt.lte.getTime()
            ) {
              rows.push({ ...row });
            }
          }
          return rows;
        },
      ),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; status: string };
          data: Record<string, unknown>;
        }) => {
          updateManyCalls += 1;
          const row = store.get(where.id);
          if (!row || row.status !== where.status) return { count: 0 };
          store.set(where.id, { ...row, ...data });
          return { count: 1 };
        },
      ),
    },
  };

  return {
    prisma,
    updateManyCalls: () => updateManyCalls,
    get: (id: string) => store.get(id),
  };
}

const patient = { clinicId: 'clinic-1', patientRef: 'DEMO-01' };

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    taskType: 'medication',
    recoveryDay: 6,
    status: TaskStatus.pending,
    completedAt: null,
    onTime: null,
    completionKey: null,
    // Window closed one hour ago relative to the fixed clock below.
    windowClosesAt: new Date('2026-07-23T09:00:00.000Z'),
    patient,
    ...overrides,
  };
}

/** Clock pinned to 10:00Z — one hour after the default task's window closes. */
const NOW = new Date('2026-07-23T10:00:00.000Z');

describe('TaskMissedJob.sweep', () => {
  it("flips a disengaged patient's overdue task to missed/on_time=false server-side", async () => {
    const { prisma, get } = makeFakePrisma([makeTask()]);
    const emit = jest.fn(async () => undefined);
    const clock = new FixedClock(NOW);
    const job = new TaskMissedJob(
      prisma as unknown as PrismaService,
      { emit } as unknown as TelemetryService,
      clock,
    );

    const marked = await job.sweep();

    expect(marked).toBe(1);
    const row = get('task-1');
    expect(row?.status).toBe(TaskStatus.missed);
    expect(row?.onTime).toBe(false);
  });

  it('emits a single categorical task_missed event with no free text', async () => {
    const { prisma } = makeFakePrisma([makeTask()]);
    const emit = jest.fn(
      async (
        _event: string,
        _payload: Record<string, unknown>,
        _meta: Record<string, unknown>,
      ) => undefined,
    );
    const job = new TaskMissedJob(
      prisma as unknown as PrismaService,
      { emit } as unknown as TelemetryService,
      new FixedClock(NOW),
    );

    await job.sweep();

    expect(emit).toHaveBeenCalledTimes(1);
    const [eventName, payload, meta] = emit.mock.calls[0];
    expect(eventName).toBe('task_missed');
    expect(payload).toEqual({
      task_type: 'medication',
      recovery_day: 6,
      on_time: false,
    });
    // Categorical only — every value is a primitive, no nested clinical blob.
    for (const value of Object.values(payload as Record<string, unknown>)) {
      expect(['string', 'number', 'boolean']).toContain(typeof value);
    }
    expect(meta).toMatchObject({ clinicId: 'clinic-1', patientRef: 'DEMO-01' });
  });

  it('leaves a task whose window has not yet closed untouched', async () => {
    const future = makeTask({
      id: 'task-future',
      windowClosesAt: new Date('2026-07-23T11:00:00.000Z'), // after NOW
    });
    const { prisma, get } = makeFakePrisma([future]);
    const emit = jest.fn(async () => undefined);
    const job = new TaskMissedJob(
      prisma as unknown as PrismaService,
      { emit } as unknown as TelemetryService,
      new FixedClock(NOW),
    );

    const marked = await job.sweep();

    expect(marked).toBe(0);
    expect(get('task-future')?.status).toBe(TaskStatus.pending);
    expect(emit).not.toHaveBeenCalled();
  });

  it('never re-marks a completed task (only pending rows are candidates)', async () => {
    const completed = makeTask({
      id: 'task-done',
      status: TaskStatus.completed,
      completedAt: new Date('2026-07-23T08:30:00.000Z'),
      onTime: true,
    });
    const { prisma, get } = makeFakePrisma([completed]);
    const emit = jest.fn(async () => undefined);
    const job = new TaskMissedJob(
      prisma as unknown as PrismaService,
      { emit } as unknown as TelemetryService,
      new FixedClock(NOW),
    );

    const marked = await job.sweep();

    expect(marked).toBe(0);
    expect(get('task-done')?.status).toBe(TaskStatus.completed);
    expect(get('task-done')?.onTime).toBe(true);
    expect(emit).not.toHaveBeenCalled();
  });

  it('is idempotent: a second sweep marks nothing and emits nothing further', async () => {
    const { prisma } = makeFakePrisma([makeTask()]);
    const emit = jest.fn(async () => undefined);
    const job = new TaskMissedJob(
      prisma as unknown as PrismaService,
      { emit } as unknown as TelemetryService,
      new FixedClock(NOW),
    );

    expect(await job.sweep()).toBe(1);
    expect(await job.sweep()).toBe(0);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('advancing the clock past the window is what makes a task overdue', async () => {
    // Window closes at 10:30Z; the clock starts before it => not yet missed.
    const task = makeTask({
      windowClosesAt: new Date('2026-07-23T10:30:00.000Z'),
    });
    const { prisma, get } = makeFakePrisma([task]);
    const emit = jest.fn(async () => undefined);
    const clock = new FixedClock(new Date('2026-07-23T10:00:00.000Z'));
    const job = new TaskMissedJob(
      prisma as unknown as PrismaService,
      { emit } as unknown as TelemetryService,
      clock,
    );

    expect(await job.sweep()).toBe(0);
    expect(get('task-1')?.status).toBe(TaskStatus.pending);

    clock.advanceMinutes(45); // now 10:45Z, past the 10:30Z window
    expect(await job.sweep()).toBe(1);
    expect(get('task-1')?.status).toBe(TaskStatus.missed);
  });
});
