import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  PrismaClient,
  Language as PrismaLanguage,
  Tier as PrismaTier,
} from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { Clock, FixedClock } from '../src/common/clock';
import { JwtTokenService } from '../src/auth/jwt';

/**
 * SP2 Task 2 — check-in submission (e2e).
 *
 * Proves the three mandated behaviours:
 *   1. free-text answers are rejected (categorical/numeric only);
 *   2. a duplicate `Idempotency-Key` yields exactly ONE check-in and ONE escalation;
 *   3. the tier→content KEY is correct in-hours and out-of-hours (emergency ignores
 *      hours; out-of-hours collapses urgent+routine onto the out-of-hours key).
 *
 * Time is deterministic: the app's Clock is overridden with a FixedClock the test
 * drives across the clinic's opening boundary (Asia/Tashkent, 09:00–18:00).
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
const patientId = uuidv7();

// Tashkent is UTC+5 (no DST). Working days are ALL days so only time-of-day
// controls in/out-of-hours; the clock instants below straddle 09:00–18:00 local.
const IN_HOURS = new Date('2026-06-17T07:00:00Z'); // 12:00 Tashkent → in hours
const OUT_HOURS = new Date('2026-06-17T22:00:00Z'); // 03:00 Tashkent → out of hours

const clock = new FixedClock(IN_HOURS);

function baselineAnswers(): Array<{ ref: string; value: string | number | string[] }> {
  return [
    { ref: 'q1_temp', value: 'under_37_5' },
    { ref: 'q2_pain', value: 3 },
    { ref: 'q3_pain_change', value: 'better' },
    { ref: 'q4_wound', value: 'normal' },
    { ref: 'q5_redflags', value: ['none'] },
    { ref: 'q6_intake', value: 'yes' },
    { ref: 'q7_urine', value: 'yes' },
  ];
}

function withAnswer(
  ref: string,
  value: string | number | string[],
): Array<{ ref: string; value: string | number | string[] }> {
  return baselineAnswers().map((a) => (a.ref === ref ? { ref, value } : a));
}

describe('Check-in submission (e2e)', () => {
  let app: INestApplication;
  let raw: PrismaClient;
  let token: string;

  beforeAll(async () => {
    ensureDatabaseUrl();

    // Self-contained RS256 keypair so the suite does not depend on .env keys.
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

    token = moduleRef.get(JwtTokenService).signPatientAccess(patientId, clinicId);
  });

  afterAll(async () => {
    await cleanup(raw);
    await app?.close();
    await raw?.$disconnect();
  });

  const submit = (
    answers: Array<{ ref: string; value: string | number | string[] }>,
    idempotencyKey: string,
  ) =>
    request(app.getHttpServer())
      .post('/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ answers });

  it('rejects a free-text answer with 400 VALIDATION_ERROR', async () => {
    clock.set(IN_HOURS);
    const res = await submit(
      withAnswer('q4_wound', 'the wound is oozing green pus and I feel awful'),
      `free-${uuidv7()}`,
    );
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an unknown question ref with 400 VALIDATION_ERROR', async () => {
    clock.set(IN_HOURS);
    const res = await request(app.getHttpServer())
      .post('/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `unknown-${uuidv7()}`)
      .send({ answers: [...baselineAnswers(), { ref: 'q99_note', value: 'anything' }] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an out-of-range scale value with 400 VALIDATION_ERROR', async () => {
    clock.set(IN_HOURS);
    const res = await submit(withAnswer('q2_pain', 42), `range-${uuidv7()}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('requires an Idempotency-Key', async () => {
    clock.set(IN_HOURS);
    const res = await request(app.getHttpServer())
      .post('/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: baselineAnswers() });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an unauthenticated submission with 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/checkins')
      .set('Idempotency-Key', `noauth-${uuidv7()}`)
      .send({ answers: baselineAnswers() });
    expect(res.status).toBe(401);
  });

  it('a duplicate Idempotency-Key yields exactly ONE check-in and ONE escalation', async () => {
    clock.set(IN_HOURS);
    const key = `dup-${uuidv7()}`;
    const emergency = withAnswer('q4_wound', 'opening'); // emergency trigger

    const first = await submit(emergency, key);
    expect(first.status).toBe(201);
    expect(first.body.tier).toBe('emergency');
    expect(first.body.escalationId).toBeTruthy();

    const second = await submit(emergency, key);
    expect(second.status).toBe(201);
    // Same check-in and same escalation — no second effect.
    expect(second.body.checkinId).toBe(first.body.checkinId);
    expect(second.body.escalationId).toBe(first.body.escalationId);

    const third = await submit(emergency, key);
    expect(third.body.checkinId).toBe(first.body.checkinId);

    const submissionKey = `${patientId}:${key}`;
    const checkins = await raw.checkIn.count({ where: { submissionKey } });
    expect(checkins).toBe(1);
    const escalations = await raw.escalation.count({
      where: { checkIn: { submissionKey } },
    });
    expect(escalations).toBe(1);

    const escalation = await raw.escalation.findFirstOrThrow({
      where: { checkIn: { submissionKey } },
    });
    expect(escalation.status).toBe('new');
    expect(escalation.tier).toBe(PrismaTier.emergency);
  });

  describe('tier → content KEY', () => {
    it('emergency → emergency.headline (in hours) + escalation', async () => {
      clock.set(IN_HOURS);
      const res = await submit(withAnswer('q4_wound', 'opening'), `emg-in-${uuidv7()}`);
      expect(res.status).toBe(201);
      expect(res.body.tier).toBe('emergency');
      expect(res.body.contentKey).toBe('emergency.headline');
      expect(res.body.withinClinicHours).toBe(true);
      expect(res.body.escalationId).toBeTruthy();
    });

    it('emergency → emergency.headline even OUT of hours (ignores clinic hours)', async () => {
      clock.set(OUT_HOURS);
      const res = await submit(withAnswer('q4_wound', 'opening'), `emg-out-${uuidv7()}`);
      expect(res.status).toBe(201);
      expect(res.body.tier).toBe('emergency');
      expect(res.body.contentKey).toBe('emergency.headline');
      expect(res.body.withinClinicHours).toBe(false);
      expect(res.body.escalationId).toBeTruthy();
    });

    it('urgent → checkin.submitted.urgent (in hours) + escalation', async () => {
      clock.set(IN_HOURS);
      const res = await submit(withAnswer('q1_temp', '38_5_or_above'), `urg-in-${uuidv7()}`);
      expect(res.status).toBe(201);
      expect(res.body.tier).toBe('urgent');
      expect(res.body.contentKey).toBe('checkin.submitted.urgent');
      expect(res.body.escalationId).toBeTruthy();
    });

    it('urgent → checkin.submitted.out_of_hours (OUT of hours) + escalation', async () => {
      clock.set(OUT_HOURS);
      const res = await submit(withAnswer('q1_temp', '38_5_or_above'), `urg-out-${uuidv7()}`);
      expect(res.status).toBe(201);
      expect(res.body.tier).toBe('urgent');
      expect(res.body.contentKey).toBe('checkin.submitted.out_of_hours');
      expect(res.body.withinClinicHours).toBe(false);
      // Escalation is still created out of hours (the ladder decides not to call).
      expect(res.body.escalationId).toBeTruthy();
    });

    it('routine → checkin.submitted.routine (in hours), no escalation', async () => {
      clock.set(IN_HOURS);
      const res = await submit(baselineAnswers(), `rou-in-${uuidv7()}`);
      expect(res.status).toBe(201);
      expect(res.body.tier).toBe('routine');
      expect(res.body.contentKey).toBe('checkin.submitted.routine');
      expect(res.body.escalationId).toBeNull();
    });

    it('routine → checkin.submitted.out_of_hours (OUT of hours), no escalation', async () => {
      clock.set(OUT_HOURS);
      const res = await submit(baselineAnswers(), `rou-out-${uuidv7()}`);
      expect(res.status).toBe(201);
      expect(res.body.tier).toBe('routine');
      expect(res.body.contentKey).toBe('checkin.submitted.out_of_hours');
      expect(res.body.escalationId).toBeNull();
    });
  });

  it('emits categorical-only telemetry (checkin_submitted + escalation_created)', async () => {
    clock.set(IN_HOURS);
    await submit(withAnswer('q4_wound', 'opening'), `tel-${uuidv7()}`);

    const submitted = await raw.event.findFirst({
      where: { clinicId, eventName: 'checkin_submitted' },
      orderBy: { createdAt: 'desc' },
    });
    expect(submitted).not.toBeNull();
    // Payload is categorical only — a plain object of primitives, no nested blobs.
    for (const value of Object.values(submitted!.payload as Record<string, unknown>)) {
      expect(['string', 'number', 'boolean']).toContain(typeof value);
    }

    const created = await raw.event.count({
      where: { clinicId, eventName: 'escalation_created' },
    });
    expect(created).toBeGreaterThanOrEqual(1);
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
      name: 'Clinic Checkin (e2e)',
      phone: '+998710000000',
      emergencyNumber: '103',
      workingHours: '09:00-18:00',
      workingDays: 'Mon-Sun',
      timezone: 'Asia/Tashkent',
      onDutyContact: '+998901112233',
      backupContact: '+998901112244',
      headContact: '+998901112255',
      notifyMinutes: 5,
      ackMinutes: 15,
      breachMinutes: 30,
    },
  });

  await db.patient.create({
    data: {
      id: patientId,
      clinicId,
      patientRef: `PT-CHK-${patientId.slice(0, 8)}`,
      name: 'Checkin Patient',
      phone: '+998900000010',
      ageBand: '30-39',
      procedureType: 'e2e_procedure',
      dischargeDate: new Date('2026-06-10'),
      language: PrismaLanguage.EN,
      enrolmentCode: `C${uuidv7().replace(/-/g, '').slice(0, 5).toUpperCase()}`,
    },
  });

  await seedEscalationRules(db);
}

/** The placeholder-v1 tier rules (verbatim from the SP1 seed). */
async function seedEscalationRules(db: PrismaClient): Promise<void> {
  const rules: Array<{ tier: PrismaTier; conditions: unknown }> = [
    {
      tier: PrismaTier.emergency,
      conditions: {
        anyOf: [
          {
            q: 'q5_redflags',
            op: 'includesAny',
            values: [
              'difficulty_breathing',
              'chest_pain',
              'confusion',
              'very_hard_to_stay_awake',
              'heavy_bleeding',
            ],
          },
          { q: 'q4_wound', op: 'eq', value: 'opening' },
        ],
      },
    },
    {
      tier: PrismaTier.urgent,
      conditions: {
        anyOf: [
          { q: 'q1_temp', op: 'eq', value: '38_5_or_above' },
          { q: 'q5_redflags', op: 'includesAny', values: ['chills', 'new_calf_pain'] },
          { q: 'q4_wound', op: 'in', values: ['very_red_or_spreading', 'leaking'] },
          { q: 'q2_pain', op: 'gte', value: 8 },
          {
            allOf: [
              { q: 'q3_pain_change', op: 'eq', value: 'worse' },
              { q: 'q2_pain', op: 'gte', value: 6 },
            ],
          },
          { q: 'q6_intake', op: 'eq', value: 'no' },
          { q: 'q7_urine', op: 'eq', value: 'no' },
        ],
      },
    },
    { tier: PrismaTier.routine, conditions: { default: true } },
  ];

  for (const r of rules) {
    await db.escalationRule.create({
      data: {
        clinicId,
        version: 'placeholder-v1',
        tier: r.tier,
        conditions: r.conditions as object,
        approvedBy: 'e2e',
        approvedAt: new Date(),
        active: true,
      },
    });
  }
}

async function cleanup(db: PrismaClient): Promise<void> {
  await db.event.deleteMany({ where: { clinicId } });
  await db.escalationNotification.deleteMany({ where: { escalation: { patientId } } });
  await db.escalation.deleteMany({ where: { patientId } });
  await db.checkInAnswer.deleteMany({ where: { checkIn: { patientId } } });
  await db.checkIn.deleteMany({ where: { patientId } });
  await db.escalationRule.deleteMany({ where: { clinicId } });
  await db.patient.deleteMany({ where: { clinicId } });
  await db.clinic.deleteMany({ where: { id: clinicId } });
}
