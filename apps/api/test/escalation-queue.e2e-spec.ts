import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  PrismaClient,
  Language as PrismaLanguage,
  Tier as PrismaTier,
  EscalationStatus as PrismaEscalationStatus,
  TaskStatus as PrismaTaskStatus,
  TaskType as PrismaTaskType,
} from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { Clock, FixedClock } from '../src/common/clock';
import { JwtTokenService } from '../src/auth/jwt';

/**
 * SP2 Tasks 3+5 — staff escalation queue / detail / actions (e2e).
 *
 * Proves the mandated safety behaviours end-to-end:
 *   - the queue NEVER paginates or hides an unresolved urgent item;
 *   - it is ordered tier-then-age, split into sections;
 *   - detail carries the verbatim check-in answers + notification timeline;
 *   - acknowledge is forward-only + first-ack-wins (a second ack conflicts);
 *   - contact REQUIRES an outcome (no dismiss-without-outcome), and closing an
 *     escalation removes it from the unresolved queue;
 *   - there is no delete route.
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
    // Fails loudly on the first DB call if truly unset.
  }
}

const clinicId = uuidv7();
const staffId = uuidv7();
const patientId = uuidv7();

// A fixed "now" well after every seeded escalation's created_at.
const NOW = new Date('2026-06-17T10:00:00Z'); // 15:00 Tashkent → in hours
const clock = new FixedClock(NOW);

const URGENT_COUNT = 25; // deliberately > any default page size

// Shared seed output (populated by seed(), read by the specs).
const urgentIds: string[] = [];
let emergencyId!: string;
let ackTargetId!: string;
let contactTargetId!: string;

describe('Escalation queue / detail / actions (e2e)', () => {
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

    token = moduleRef.get(JwtTokenService).signStaffAccess(staffId, clinicId, 'staff');
  });

  afterAll(async () => {
    await cleanup(raw);
    await app?.close();
    await raw?.$disconnect();
  });

  const get = (path: string) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);
  const post = (path: string) =>
    request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${token}`);

  it('requires a staff token', async () => {
    const res = await request(app.getHttpServer()).get('/v1/escalations');
    expect(res.status).toBe(401);
  });

  it('never hides an unresolved urgent item (no pagination)', async () => {
    const res = await get('/v1/escalations');
    expect(res.status).toBe(200);

    // Every seeded unresolved urgent appears — none paginated away.
    const returnedUrgent = res.body.sections.urgent.map((i: { id: string }) => i.id).sort();
    expect(returnedUrgent).toEqual([...urgentIds].sort());
    // All seeded unresolved urgents (well beyond any default page size) are present.
    expect(res.body.sections.urgent.length).toBe(urgentIds.length);
    expect(res.body.sections.urgent.length).toBeGreaterThan(URGENT_COUNT);

    // The emergency sits in its own section; no cursor/paging field exists.
    expect(res.body.sections.emergency.map((i: { id: string }) => i.id)).toContain(emergencyId);
    expect(res.body).not.toHaveProperty('nextCursor');
  });

  it('orders within the urgent section oldest-first (tier-then-age)', async () => {
    const res = await get('/v1/escalations');
    const created = res.body.sections.urgent.map((i: { createdAt: string }) =>
      new Date(i.createdAt).getTime(),
    );
    const sorted = [...created].sort((a, b) => a - b);
    expect(created).toEqual(sorted);
    // Each item exposes elapsed + status + last_updated.
    const sample = res.body.sections.urgent[0];
    expect(typeof sample.elapsedMinutes).toBe('number');
    expect(sample.status).toBe('new');
    expect(sample).toHaveProperty('lastUpdated');
  });

  it('detail returns verbatim answers, deciding rule, timeline, history + adherence', async () => {
    const res = await get(`/v1/escalations/${emergencyId}`);
    expect(res.status).toBe(200);

    expect(res.body.tier).toBe('emergency');
    expect(res.body.ruleVersion).toBe('placeholder-v1');

    // Verbatim answers include the emergency trigger, exactly as stored.
    const wound = res.body.answers.find(
      (a: { questionRef: string }) => a.questionRef === 'q4_wound',
    );
    expect(wound.answerValue).toBe('opening');

    // Notification timeline (seeded one attempt).
    expect(res.body.notifications.length).toBeGreaterThanOrEqual(1);
    expect(res.body.notifications[0].recipientRole).toBe('on_duty');

    // Adherence always carries its denominator (excludes future tasks).
    expect(res.body.adherence.assignedWindowClosed).toBe(2);
    expect(res.body.adherence.completedOnTime).toBe(1);
    expect(res.body.adherence.ratio).toBeCloseTo(0.5);

    expect(res.body.recentCheckIns.length).toBeGreaterThanOrEqual(1);
    expect(res.body.patient.phone).toBeTruthy();
  });

  it('acknowledge is forward-only + first-ack-wins', async () => {
    const first = await post(`/v1/escalations/${ackTargetId}/acknowledge`);
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('acknowledged');

    // A second acknowledge finds it already advanced — conflict, no silent re-ack.
    const second = await post(`/v1/escalations/${ackTargetId}/acknowledge`);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('DUPLICATE_REQUEST');
  });

  it('contact REQUIRES an outcome_code', async () => {
    const missing = await post(`/v1/escalations/${contactTargetId}/contact`).send({});
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe('VALIDATION_ERROR');

    const bad = await post(`/v1/escalations/${contactTargetId}/contact`).send({
      outcomeCode: 'not_a_real_code',
    });
    expect(bad.status).toBe(400);
  });

  it('contact with an outcome closes the escalation and removes it from unresolved', async () => {
    const ok = await post(`/v1/escalations/${contactTargetId}/contact`).send({
      outcomeCode: 'advised_at_home',
      clinicalNote: 'Reassured; monitor at home.',
    });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('contacted');
    expect(ok.body.outcomeCode).toBe('advised_at_home');

    // Gone from the default (unresolved) queue…
    const unresolved = await get('/v1/escalations');
    const ids = unresolved.body.sections.urgent.map((i: { id: string }) => i.id);
    expect(ids).not.toContain(contactTargetId);

    // …but still present under filter=all (append-only history).
    const all = await get('/v1/escalations?filter=all');
    const allIds = [
      ...all.body.sections.urgent,
      ...all.body.sections.emergency,
    ].map((i: { id: string }) => i.id);
    expect(allIds).toContain(contactTargetId);
  });

  it('has no delete route', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/v1/escalations/${emergencyId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
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
      name: 'Clinic Queue (e2e)',
      phone: '+998710000000',
      emergencyNumber: '103',
      workingHours: '09:00-18:00',
      workingDays: 'Mon-Sun',
      timezone: 'Asia/Tashkent',
      onDutyContact: '+998901112233',
      backupContact: '+998901112244',
      headContact: '+998901112255',
      notifyMinutes: 0,
      ackMinutes: 15,
      breachMinutes: 30,
    },
  });

  await db.staff.create({
    data: {
      id: staffId,
      clinicId,
      name: 'Queue Nurse',
      email: `nurse-${staffId.slice(0, 8)}@example.test`,
      passwordHash: 'x',
      role: 'staff',
    },
  });

  await db.patient.create({
    data: {
      id: patientId,
      clinicId,
      patientRef: `PT-Q-${patientId.slice(0, 8)}`,
      name: 'Queue Patient',
      phone: '+998900000010',
      ageBand: '30-39',
      procedureType: 'e2e_procedure',
      dischargeDate: new Date('2026-06-10'),
      language: PrismaLanguage.EN,
      enrolmentCode: `Q${uuidv7().replace(/-/g, '').slice(0, 5).toUpperCase()}`,
    },
  });

  // Tasks: two closed (one on-time, one missed) + one future → adherence 1/2.
  await db.task.create({
    data: {
      patientId,
      taskType: PrismaTaskType.medication,
      scheduledFor: new Date('2026-06-16T06:00:00Z'),
      windowClosesAt: new Date('2026-06-16T08:00:00Z'),
      recoveryDay: 6,
      status: PrismaTaskStatus.completed,
      completedAt: new Date('2026-06-16T07:00:00Z'),
      onTime: true,
    },
  });
  await db.task.create({
    data: {
      patientId,
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
      patientId,
      taskType: PrismaTaskType.medication,
      scheduledFor: new Date('2026-06-18T06:00:00Z'), // future — excluded
      windowClosesAt: new Date('2026-06-18T08:00:00Z'),
      recoveryDay: 8,
      status: PrismaTaskStatus.pending,
    },
  });

  // A batch of unresolved urgent escalations, staggered in age (oldest first).
  for (let i = 0; i < URGENT_COUNT; i += 1) {
    const createdAt = new Date(NOW.getTime() - (URGENT_COUNT - i) * 60_000);
    const id = await makeEscalation(db, {
      tier: PrismaTier.urgent,
      status: PrismaEscalationStatus.new,
      createdAt,
      wound: 'very_red_or_spreading',
    });
    urgentIds.push(id);
  }

  // One emergency (with a notification) for the detail test.
  emergencyId = await makeEscalation(db, {
    tier: PrismaTier.emergency,
    status: PrismaEscalationStatus.new,
    createdAt: new Date(NOW.getTime() - 3 * 60_000),
    wound: 'opening',
    withNotification: true,
  });

  // Dedicated targets for the acknowledge / contact action tests.
  ackTargetId = await makeEscalation(db, {
    tier: PrismaTier.urgent,
    status: PrismaEscalationStatus.new,
    createdAt: new Date(NOW.getTime() - 2 * 60_000),
    wound: 'leaking',
  });
  urgentIds.push(ackTargetId);

  contactTargetId = await makeEscalation(db, {
    tier: PrismaTier.urgent,
    status: PrismaEscalationStatus.new,
    createdAt: new Date(NOW.getTime() - 60_000),
    wound: 'leaking',
  });
  urgentIds.push(contactTargetId);
}

/** Create a check-in (+ answers) and its escalation; returns the escalation id. */
async function makeEscalation(
  db: PrismaClient,
  opts: {
    tier: PrismaTier;
    status: PrismaEscalationStatus;
    createdAt: Date;
    wound: string;
    withNotification?: boolean;
  },
): Promise<string> {
  const checkinId = uuidv7();
  await db.checkIn.create({
    data: {
      id: checkinId,
      patientId,
      submittedAt: opts.createdAt,
      recoveryDay: 6,
      questionSetVersion: 'placeholder-v1',
      ruleVersion: 'placeholder-v1',
      tierAssigned: opts.tier,
      withinClinicHours: true,
      answers: {
        create: [
          { questionRef: 'q1_temp', answerValue: 'under_37_5' },
          { questionRef: 'q2_pain', answerValue: '4' },
          { questionRef: 'q4_wound', answerValue: opts.wound },
        ],
      },
    },
  });

  const escalationId = uuidv7();
  await db.escalation.create({
    data: {
      id: escalationId,
      checkinId,
      patientId,
      tier: opts.tier,
      status: opts.status,
      createdAt: opts.createdAt,
    },
  });

  if (opts.withNotification) {
    await db.escalationNotification.create({
      data: {
        escalationId,
        attemptNumber: 1,
        channel: 'in_dashboard',
        recipientRole: 'on_duty',
        sentAt: opts.createdAt,
        delivered: true,
      },
    });
  }

  return escalationId;
}

async function cleanup(db: PrismaClient): Promise<void> {
  await db.event.deleteMany({ where: { clinicId } });
  await db.escalationNotification.deleteMany({ where: { escalation: { patientId } } });
  await db.escalation.deleteMany({ where: { patientId } });
  await db.checkInAnswer.deleteMany({ where: { checkIn: { patientId } } });
  await db.checkIn.deleteMany({ where: { patientId } });
  await db.task.deleteMany({ where: { patientId } });
  await db.patient.deleteMany({ where: { clinicId } });
  await db.staff.deleteMany({ where: { clinicId } });
  await db.clinic.deleteMany({ where: { id: clinicId } });
}
