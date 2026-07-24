import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  EscalationStatus as PrismaEscalationStatus,
  Language as PrismaLanguage,
  PrismaClient,
  TaskStatus as PrismaTaskStatus,
  TaskType as PrismaTaskType,
  Tier as PrismaTier,
} from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import request from 'supertest';
import { StaffRole } from '@hospital-ai/shared-types';

import { AppModule } from '../src/app.module';
import { Clock, FixedClock } from '../src/common/clock';
import { JwtTokenService } from '../src/auth/jwt';

/**
 * Backend-gap D4/D5 — enriched patients (e2e).
 *
 * Proves:
 *   - the list is enriched server-side (adherence %, last active, open escalations,
 *     attention flag = adherence<50% OR no activity 3+ days);
 *   - detail carries the adherence-over-time series, task/check-in/escalation
 *     history (with tier + outcome) and the immutable consent record;
 *   - reissue-code invalidates the old code and issues a fresh 14-day one;
 *   - withdraw stops FUTURE tasks, retains history, and flags status withdrawn.
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
    // fails loudly on first DB call if truly unset
  }
}

const clinicId = uuidv7();
const staffId = uuidv7();
const p1Id = uuidv7(); // healthy patient
const p2Id = uuidv7(); // attention patient
const futureTaskId = uuidv7();
const ORIGINAL_CODE = `Z${uuidv7().replace(/-/g, '').slice(0, 5).toUpperCase()}`;

const NOW = new Date('2026-06-17T10:00:00Z'); // 15:00 Tashkent
const clock = new FixedClock(NOW);

describe('Enriched patients (e2e)', () => {
  let app: INestApplication;
  let raw: PrismaClient;
  let token: string;

  beforeAll(async () => {
    ensureDatabaseUrl();

    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    process.env.JWT_PRIVATE_KEY = privateKey;
    process.env.JWT_PUBLIC_KEY = publicKey;

    raw = new PrismaClient();
    await raw.$connect();
    await seed(raw);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(clock)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    token = moduleRef.get(JwtTokenService).signStaffAccess(staffId, clinicId, StaffRole.staff);
  });

  afterAll(async () => {
    await cleanup(raw);
    await app?.close();
    await raw?.$disconnect();
  });

  const get = (p: string) => request(app.getHttpServer()).get(p).set('Authorization', `Bearer ${token}`);
  const post = (p: string) => request(app.getHttpServer()).post(p).set('Authorization', `Bearer ${token}`);
  const patch = (p: string) => request(app.getHttpServer()).patch(p).set('Authorization', `Bearer ${token}`);

  it('requires a staff token', async () => {
    const res = await request(app.getHttpServer()).get('/v1/patients');
    expect(res.status).toBe(401);
  });

  it('enriches the list: adherence, last active, open escalations, attention flag', async () => {
    const res = await get('/v1/patients');
    expect(res.status).toBe(200);

    const p1 = res.body.items.find((i: { id: string }) => i.id === p1Id);
    expect(p1).toBeTruthy();
    expect(p1.recoveryDay).toBe(6);
    expect(p1.adherence).toBeCloseTo(0.5); // 1 on-time of 2 window-closed
    expect(p1.adherenceNumerator).toBe(1);
    expect(p1.adherenceDenominator).toBe(2);
    expect(p1.openEscalations).toBe(1); // one 'new' (the contacted one is closed)
    expect(p1.lastActive).toBeTruthy();
    expect(p1.attentionFlag).toBe(false);

    const p2 = res.body.items.find((i: { id: string }) => i.id === p2Id);
    expect(p2.adherence).toBe(0); // 0 of 2
    expect(p2.attentionFlag).toBe(true); // low adherence + inactive
  });

  it('detail carries the adherence series, histories (tier + outcome) and consent', async () => {
    const res = await get(`/v1/patients/${p1Id}`);
    expect(res.status).toBe(200);

    // Adherence over time by recovery day.
    const day5 = res.body.adherenceOverTime.find((d: { recoveryDay: number }) => d.recoveryDay === 5);
    const day6 = res.body.adherenceOverTime.find((d: { recoveryDay: number }) => d.recoveryDay === 6);
    expect(day5.value).toBeCloseTo(1);
    expect(day6.value).toBeCloseTo(0);

    // Task history retains every task.
    expect(res.body.taskHistory.length).toBe(3);

    // Check-ins carry tier + escalation outcome.
    const contacted = res.body.checkIns.find(
      (c: { escalationStatus: string | null }) => c.escalationStatus === 'contacted',
    );
    expect(contacted.tier).toBe('urgent');
    expect(contacted.outcomeCode).toBe('advised_at_home');

    // Escalation history + immutable consent.
    expect(res.body.escalations.length).toBe(2);
    expect(res.body.consent.version).toBe('v1.0');
  });

  it('re-issues the enrolment code (fresh 14-day expiry, old code invalidated)', async () => {
    const res = await post(`/v1/patients/${p1Id}/reissue-code`);
    expect(res.status).toBe(200);
    expect(res.body.enrolmentCode).toHaveLength(6);
    expect(res.body.enrolmentCode).not.toBe(ORIGINAL_CODE);
    // 14 days after the fixed clock's now.
    expect(new Date(res.body.codeExpiresAt).toISOString()).toBe('2026-07-01T10:00:00.000Z');

    const inDb = await raw.patient.findUnique({ where: { id: p1Id } });
    expect(inDb?.enrolmentCode).toBe(res.body.enrolmentCode);
  });

  it('withdraws a patient: stops future tasks, retains history, flags withdrawn', async () => {
    const res = await patch(`/v1/patients/${p1Id}/withdraw`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('withdrawn');
    expect(res.body.tasksStopped).toBe(1); // only the future pending task

    const inDb = await raw.patient.findUnique({ where: { id: p1Id } });
    expect(inDb?.status).toBe('withdrawn');

    // The future task is gone; the closed (completed/missed) history is retained.
    const future = await raw.task.findUnique({ where: { id: futureTaskId } });
    expect(future).toBeNull();
    const retained = await raw.task.count({ where: { patientId: p1Id } });
    expect(retained).toBe(2);
  });

  it('refuses to re-issue a code for a withdrawn patient', async () => {
    const res = await post(`/v1/patients/${p1Id}/reissue-code`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
  });
});

// ---------------------------------------------------------------------------
// Seed / cleanup (raw client).
// ---------------------------------------------------------------------------

async function seed(db: PrismaClient): Promise<void> {
  await cleanup(db);

  await db.clinic.create({
    data: {
      id: clinicId,
      name: 'Patients Clinic (e2e)',
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

  await db.staff.create({
    data: {
      id: staffId,
      clinicId,
      name: 'Nurse',
      email: `nurse-${staffId.slice(0, 8)}@e2e.example`,
      passwordHash: 'x',
      role: StaffRole.staff,
    },
  });

  // ---- P1: healthy patient (recovery day 6) --------------------------------
  await db.patient.create({
    data: {
      id: p1Id,
      clinicId,
      patientRef: `PT-1-${p1Id.slice(0, 8)}`,
      name: 'Healthy Patient',
      phone: '+998900000011',
      ageBand: '30-39',
      procedureType: 'e2e_procedure',
      dischargeDate: new Date('2026-06-11'),
      language: PrismaLanguage.EN,
      status: 'active',
      enrolmentCode: ORIGINAL_CODE,
      codeExpiresAt: new Date('2026-06-20T00:00:00Z'),
      consentVersion: 'v1.0',
      consentedAt: new Date('2026-06-11T09:00:00Z'),
    },
  });

  await db.consent.create({
    data: {
      patientId: p1Id,
      version: 'v1.0',
      acceptedAt: new Date('2026-06-11T09:00:00Z'),
      textSnapshot: 'Consent text (e2e).',
    },
  });

  // Tasks: one on-time (day5), one missed (day6), one future pending (day8).
  await db.task.create({
    data: {
      patientId: p1Id,
      taskType: PrismaTaskType.medication,
      scheduledFor: new Date('2026-06-16T06:00:00Z'),
      windowClosesAt: new Date('2026-06-16T08:00:00Z'),
      recoveryDay: 5,
      status: PrismaTaskStatus.completed,
      completedAt: new Date('2026-06-16T07:00:00Z'),
      onTime: true,
    },
  });
  await db.task.create({
    data: {
      patientId: p1Id,
      taskType: PrismaTaskType.medication,
      scheduledFor: new Date('2026-06-16T18:00:00Z'),
      windowClosesAt: new Date('2026-06-16T20:00:00Z'),
      recoveryDay: 6,
      status: PrismaTaskStatus.missed,
      onTime: false,
    },
  });
  await db.task.create({
    data: {
      id: futureTaskId,
      patientId: p1Id,
      taskType: PrismaTaskType.medication,
      scheduledFor: new Date('2026-06-19T06:00:00Z'),
      windowClosesAt: new Date('2026-06-19T08:00:00Z'),
      recoveryDay: 8,
      status: PrismaTaskStatus.pending,
    },
  });

  // Check-in CI2 (day 4) -> contacted escalation.
  const ci2 = uuidv7();
  await db.checkIn.create({
    data: {
      id: ci2,
      patientId: p1Id,
      submittedAt: new Date('2026-06-15T10:00:00Z'),
      recoveryDay: 4,
      questionSetVersion: 'placeholder-v1',
      ruleVersion: 'placeholder-v1',
      tierAssigned: PrismaTier.urgent,
      withinClinicHours: true,
    },
  });
  await db.escalation.create({
    data: {
      checkinId: ci2,
      patientId: p1Id,
      tier: PrismaTier.urgent,
      status: PrismaEscalationStatus.contacted,
      outcomeCode: 'advised_at_home',
      createdAt: new Date('2026-06-15T10:01:00Z'),
    },
  });

  // Check-in CI1 (day 5) -> open (new) escalation.
  const ci1 = uuidv7();
  await db.checkIn.create({
    data: {
      id: ci1,
      patientId: p1Id,
      submittedAt: new Date('2026-06-16T10:00:00Z'),
      recoveryDay: 5,
      questionSetVersion: 'placeholder-v1',
      ruleVersion: 'placeholder-v1',
      tierAssigned: PrismaTier.urgent,
      withinClinicHours: true,
    },
  });
  await db.escalation.create({
    data: {
      checkinId: ci1,
      patientId: p1Id,
      tier: PrismaTier.urgent,
      status: PrismaEscalationStatus.new,
      createdAt: new Date('2026-06-16T10:01:00Z'),
    },
  });

  // ---- P2: attention patient (low adherence + inactive) --------------------
  await db.patient.create({
    data: {
      id: p2Id,
      clinicId,
      patientRef: `PT-2-${p2Id.slice(0, 8)}`,
      name: 'Attention Patient',
      phone: '+998900000012',
      ageBand: '60-69',
      procedureType: 'e2e_procedure',
      dischargeDate: new Date('2026-06-11'),
      language: PrismaLanguage.RU,
      status: 'active',
      enrolmentCode: `Y${uuidv7().replace(/-/g, '').slice(0, 5).toUpperCase()}`,
    },
  });
  await db.task.createMany({
    data: [
      {
        patientId: p2Id,
        taskType: PrismaTaskType.medication,
        scheduledFor: new Date('2026-06-14T06:00:00Z'),
        windowClosesAt: new Date('2026-06-14T08:00:00Z'),
        recoveryDay: 3,
        status: PrismaTaskStatus.missed,
        onTime: false,
      },
      {
        patientId: p2Id,
        taskType: PrismaTaskType.medication,
        scheduledFor: new Date('2026-06-15T06:00:00Z'),
        windowClosesAt: new Date('2026-06-15T08:00:00Z'),
        recoveryDay: 4,
        status: PrismaTaskStatus.missed,
        onTime: false,
      },
    ],
  });
}

async function cleanup(db: PrismaClient): Promise<void> {
  const patientIds = [p1Id, p2Id];
  await db.escalationNotification.deleteMany({
    where: { escalation: { patientId: { in: patientIds } } },
  });
  await db.escalation.deleteMany({ where: { patientId: { in: patientIds } } });
  await db.checkInAnswer.deleteMany({ where: { checkIn: { patientId: { in: patientIds } } } });
  await db.checkIn.deleteMany({ where: { patientId: { in: patientIds } } });
  await db.task.deleteMany({ where: { patientId: { in: patientIds } } });
  await db.consent.deleteMany({ where: { patientId: { in: patientIds } } });
  await db.patient.deleteMany({ where: { clinicId } });
  await db.staff.deleteMany({ where: { clinicId } });
  await db.clinic.deleteMany({ where: { id: clinicId } });
}
