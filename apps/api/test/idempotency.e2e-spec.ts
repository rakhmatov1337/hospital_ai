import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  PrismaClient,
  Language as PrismaLanguage,
  TaskType as PrismaTaskType,
  TaskStatus as PrismaTaskStatus,
} from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { JwtTokenService } from '../src/auth/jwt';

/**
 * MANDATORY negative test (5): a duplicate `Idempotency-Key` on task completion
 * produces a SINGLE effect.
 *
 * `POST /v1/tasks/:id/complete` is replayed three times with the same
 * Idempotency-Key (the offline-sync retry shape). The task must end completed
 * exactly once and exactly one `task_completed` analytics Event must be written —
 * no double mutation, no duplicated telemetry.
 *
 * NOTE on check-ins: the spec pairs task-complete with check-in submission for
 * idempotency. Check-in *submission* (and its tiering) is an SP2 behaviour — the
 * SP1 CheckinsService is a schema-backed skeleton with no submit path — so the
 * check-in half is deferred to SP2 (the schema already carries `submission_key`,
 * a unique column, ready for the same idempotency contract). This test proves the
 * one idempotent write path that exists in SP1.
 */

function ensureDatabaseUrl(): void {
  if (process.env.DATABASE_URL) return;
  try {
    const envText = readFileSync(resolve(__dirname, '../.env'), 'utf8');
    for (const line of envText.split(/\r?\n/)) {
      const match = /^DATABASE_URL=(.*)$/.exec(line.trim());
      if (match) {
        process.env.DATABASE_URL = match[1].replace(/^["']|["']$/g, '');
        break;
      }
    }
  } catch {
    // Fails loudly on first DB call if truly unset.
  }
}

const clinicId = uuidv7();
const patientId = uuidv7();
const taskId = uuidv7();

const IDEMPOTENCY_KEY = `idem-${taskId}`;

describe('Idempotent task completion (e2e)', () => {
  let app: INestApplication;
  let raw: PrismaClient;
  let patientToken: string;

  beforeAll(async () => {
    ensureDatabaseUrl();

    raw = new PrismaClient();
    await raw.$connect();
    await seed(raw);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    // Task completion is a PATIENT action — `aud:"patient"`, scoped to the
    // caller's own patient (never the request body) — so the replay must carry a
    // patient token for this patient.
    patientToken = moduleRef.get(JwtTokenService).signPatientAccess(patientId, clinicId);
  });

  afterAll(async () => {
    await cleanup(raw);
    await app?.close();
    await raw?.$disconnect();
  });

  it('applies a single effect when the same Idempotency-Key is replayed', async () => {
    const call = () =>
      request(app.getHttpServer())
        .post(`/v1/tasks/${taskId}/complete`)
        .set('Authorization', `Bearer ${patientToken}`)
        .set('Idempotency-Key', IDEMPOTENCY_KEY);

    const first = await call();
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('completed');
    expect(first.body.completionKey).toBe(IDEMPOTENCY_KEY);

    // Two replays with the SAME key — must not double-apply.
    const second = await call();
    expect(second.status).toBe(200);
    expect(second.body.status).toBe('completed');

    const third = await call();
    expect(third.status).toBe(200);
    expect(third.body.status).toBe('completed');

    // Single effect in the DB: the task is completed once, on-time flag set once.
    const task = await raw.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(task.status).toBe(PrismaTaskStatus.completed);
    expect(task.completionKey).toBe(IDEMPOTENCY_KEY);
    expect(task.completedAt).not.toBeNull();

    // Exactly ONE task_completed Event was appended across the three calls.
    const events = await raw.event.count({
      where: { clinicId, eventName: 'task_completed' },
    });
    expect(events).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Seed / cleanup (raw client — bypasses tenancy/immutability extensions).
// ---------------------------------------------------------------------------

async function seed(db: PrismaClient): Promise<void> {
  await cleanup(db);

  await db.clinic.create({
    data: {
      id: clinicId,
      name: 'Clinic Idem (e2e)',
      phone: '+998710000000',
      emergencyNumber: '103',
      workingHours: '09:00-18:00',
      workingDays: 'Mon-Sat',
      timezone: 'Asia/Tashkent',
      notifyMinutes: 5,
      ackMinutes: 15,
      breachMinutes: 30,
    },
  });

  await db.patient.create({
    data: {
      id: patientId,
      clinicId,
      patientRef: `PT-IDEM-${patientId.slice(0, 8)}`,
      name: 'Idem Patient',
      phone: '+998900000010',
      ageBand: '30-39',
      procedureType: 'e2e_procedure',
      dischargeDate: new Date('2026-07-18'),
      language: PrismaLanguage.EN,
      enrolmentCode: `I${uuidv7().replace(/-/g, '').slice(0, 5).toUpperCase()}`,
    },
  });

  await db.task.create({
    data: {
      id: taskId,
      patientId,
      taskType: PrismaTaskType.medication,
      scheduledFor: new Date('2026-07-19T03:00:00Z'),
      windowClosesAt: new Date(Date.now() + 60 * 60 * 1000), // 1h ahead => on_time
      recoveryDay: 1,
      status: PrismaTaskStatus.pending,
    },
  });
}

async function cleanup(db: PrismaClient): Promise<void> {
  await db.event.deleteMany({ where: { clinicId } });
  await db.task.deleteMany({ where: { patientId } });
  await db.patient.deleteMany({ where: { clinicId } });
  await db.clinic.deleteMany({ where: { id: clinicId } });
}
