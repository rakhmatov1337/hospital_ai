import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  Language as PrismaLanguage,
  PatientStatus as PrismaPatientStatus,
  PrismaClient,
  TaskStatus as PrismaTaskStatus,
  TaskType as PrismaTaskType,
} from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { Clock, FixedClock } from '../src/common/clock';
import { JwtTokenService } from '../src/auth/jwt';
import { TaskGenerationService } from '../src/plans/task-generation.service';
import { StaffRole } from '@hospital-ai/shared-types';

/**
 * SP5 Task 1 — patient app ("me") API (e2e).
 *
 * Proves the mandated behaviours:
 *   - every endpoint is patient-scoped (the token's patientId only);
 *   - cross-patient access is forbidden (completing another patient's task → 404);
 *   - POST /me/consent fires patient_enrolled exactly once (idempotent) + activates;
 *   - GET /me/today returns ONLY content keys + categorical values (no free text);
 *   - survey free_text NEVER surfaces in GET /v1/metrics (write-only);
 *   - POST /me/leave halts future task generation AND retains history rows;
 *   - PATCH /me/language changes the language instantly.
 *
 * Time is deterministic (FixedClock at a Tashkent in-hours instant); each patient's
 * discharge date is set relative to it to land on a specific recovery day.
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

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-06-30T06:00:00Z'); // 11:00 Asia/Tashkent (UTC+5) → in hours
const clock = new FixedClock(NOW);

const clinicId = uuidv7();
const otherClinicId = uuidv7();
const staffId = uuidv7();
const planId = uuidv7();

const PROCEDURE = 'e2e_me_procedure';

// Patients: A (reads/consent/language), B (cross-patient target), C (leave), D (survey).
const patientA = uuidv7();
const patientB = uuidv7();
const patientC = uuidv7();
const patientD = uuidv7();

const SECRET_FREE_TEXT = 'SECRET_FREE_TEXT_DO_NOT_LEAK_XYZ';

describe('Patient app "me" API (e2e)', () => {
  let app: INestApplication;
  let raw: PrismaClient;
  let jwt: JwtTokenService;
  let tokenA: string;
  let tokenB: string;
  let tokenC: string;
  let tokenD: string;
  let staffToken: string;

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

    // Materialise the real 30-day task set for A + B from the plan template.
    const taskGen = moduleRef.get(TaskGenerationService);
    await taskGen.generateForPatient(patientA);
    await taskGen.generateForPatient(patientB);

    jwt = moduleRef.get(JwtTokenService);
    tokenA = jwt.signPatientAccess(patientA, clinicId);
    tokenB = jwt.signPatientAccess(patientB, clinicId);
    tokenC = jwt.signPatientAccess(patientC, clinicId);
    tokenD = jwt.signPatientAccess(patientD, clinicId);
    staffToken = jwt.signStaffAccess(staffId, clinicId, StaffRole.staff);
  });

  afterAll(async () => {
    await cleanup(raw);
    await app?.close();
    await raw?.$disconnect();
  });

  const authGet = (path: string, token: string) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);
  const authPost = (path: string, token: string) =>
    request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${token}`);
  const authPatch = (path: string, token: string) =>
    request(app.getHttpServer()).patch(path).set('Authorization', `Bearer ${token}`);

  // -------------------------------------------------------------------------
  // Auth / scoping
  // -------------------------------------------------------------------------

  it('rejects an unauthenticated /me request with 401', async () => {
    const res = await request(app.getHttpServer()).get('/v1/me/profile');
    expect(res.status).toBe(401);
  });

  it('rejects a staff token on a patient /me route with 403', async () => {
    const res = await authGet('/v1/me/profile', staffToken);
    expect(res.status).toBe(403);
  });

  // -------------------------------------------------------------------------
  // 1. POST /me/consent — activates + patient_enrolled ONCE
  // -------------------------------------------------------------------------

  it('records consent, activates the patient, and fires patient_enrolled exactly once', async () => {
    const first = await authPost('/v1/me/consent', tokenA).send({ version: 'v1' });
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('active');
    expect(first.body.alreadyConsented).toBe(false);

    // Idempotent replay — no second activation, no second event.
    const second = await authPost('/v1/me/consent', tokenA).send({ version: 'v1' });
    expect(second.status).toBe(200);
    expect(second.body.alreadyConsented).toBe(true);

    const patient = await raw.patient.findUniqueOrThrow({ where: { id: patientA } });
    expect(patient.status).toBe(PrismaPatientStatus.active);

    const enrolledEvents = await raw.event.count({
      where: { clinicId, eventName: 'patient_enrolled', patientRef: 'ME-A' },
    });
    expect(enrolledEvents).toBe(1);

    // A consent row was recorded (append-only).
    const consents = await raw.consent.count({ where: { patientId: patientA } });
    expect(consents).toBe(1);
  });

  // -------------------------------------------------------------------------
  // 2. GET /me/profile — patient-scoped header + clinic contact
  // -------------------------------------------------------------------------

  it('returns the caller-scoped profile with the clinic contact block', async () => {
    const res = await authGet('/v1/me/profile', tokenA);
    expect(res.status).toBe(200);
    expect(res.body.firstName).toBe('Alice');
    expect(res.body.recoveryDay).toBe(5);
    expect(res.body.programmeDay).toBe(5);
    expect(res.body.procedureType).toBe(PROCEDURE);
    expect(res.body.clinic).toMatchObject({
      name: 'Clinic Me (e2e)',
      phone: '+998710000000',
      emergencyNumber: '103',
    });
  });

  it('isolates patients: B sees only B (a different token, a different patient)', async () => {
    const a = await authGet('/v1/me/profile', tokenA);
    const b = await authGet('/v1/me/profile', tokenB);
    expect(a.body.firstName).toBe('Alice');
    expect(b.body.firstName).toBe('Bob');
  });

  // -------------------------------------------------------------------------
  // 3. GET /me/today — content keys + categoricals ONLY
  // -------------------------------------------------------------------------

  it("returns today's tasks grouped by type with content KEYS + categorical values only", async () => {
    const res = await authGet('/v1/me/today', tokenA);
    expect(res.status).toBe(200);
    expect(res.body.recoveryDay).toBe(5);
    expect(res.body.checkinDue).toBe(true);

    const KNOWN_TYPES = ['medication', 'activity', 'wound_care', 'education', 'checkin'];
    const allTasks: Array<Record<string, unknown>> = Object.values(res.body.groups).flat() as never;
    expect(allTasks.length).toBeGreaterThan(0);

    for (const task of allTasks) {
      // taskType is a categorical enum member.
      expect(KNOWN_TYPES).toContain(task.taskType);
      // contentRef is a content-library KEY (never free text / a sentence).
      expect(typeof task.contentRef).toBe('string');
      expect(task.contentRef as string).toMatch(/^[a-z][a-z0-9_.]*$/);
      expect(task.contentRef as string).not.toMatch(/\s/);
      // status is a categorical enum; the timestamps are ISO strings.
      expect(['pending', 'completed', 'missed']).toContain(task.status);
      expect(() => new Date(task.scheduledFor as string).toISOString()).not.toThrow();
    }
  });

  // -------------------------------------------------------------------------
  // 4. GET /me/progress — adherence with denominator
  // -------------------------------------------------------------------------

  it('returns adherence with a denominator + a per-day completion series', async () => {
    const res = await authGet('/v1/me/progress', tokenA);
    expect(res.status).toBe(200);
    expect(res.body.programmeDays).toBe(30);
    expect(res.body.adherence).toHaveProperty('numerator');
    expect(res.body.adherence).toHaveProperty('denominator');
    expect(typeof res.body.adherence.denominator).toBe('number');
    expect(Array.isArray(res.body.perDay)).toBe(true);
    expect(typeof res.body.daysCompleted).toBe('number');
  });

  // -------------------------------------------------------------------------
  // 5. GET /me/checkin/questions — structured contract
  // -------------------------------------------------------------------------

  it('returns the structured check-in questions (ref + questionContentKey + options)', async () => {
    const res = await authGet('/v1/me/checkin/questions', tokenA);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(7);
    const q4 = res.body.find((q: { ref: string }) => q.ref === 'q4_wound');
    expect(q4.questionContentKey).toBe('checkin.q4_wound');
    expect(q4.options.map((o: { code: string }) => o.code)).toContain('opening');
  });

  // -------------------------------------------------------------------------
  // 6. GET /me/content?category=education — unlocked KEYS for the recovery day
  // -------------------------------------------------------------------------

  it('returns only the education keys unlocked for the current recovery day (keys only)', async () => {
    const res = await authGet('/v1/me/content?category=education', tokenA);
    expect(res.status).toBe(200);
    expect(res.body.category).toBe('education');
    const days = res.body.items.map((i: { unlockDay: number }) => i.unlockDay).sort();
    // Day 5 patient: unlocks days 1, 3, 5 — NOT day 7.
    expect(days).toEqual([1, 3, 5]);
    for (const item of res.body.items) {
      expect(item.contentKey).toMatch(/^clinical\./);
    }
  });

  // -------------------------------------------------------------------------
  // Cross-patient: completing another patient's task is forbidden (404)
  // -------------------------------------------------------------------------

  it("forbids completing another patient's task (A cannot complete B's task → 404)", async () => {
    const bTask = await raw.task.findFirstOrThrow({ where: { patientId: patientB } });
    const res = await authPost(`/v1/tasks/${bTask.id}/complete`, tokenA)
      .set('Idempotency-Key', `xpat-${uuidv7()}`)
      .send({});
    expect(res.status).toBe(404);

    // The task is untouched — still pending.
    const after = await raw.task.findUniqueOrThrow({ where: { id: bTask.id } });
    expect(after.status).toBe(PrismaTaskStatus.pending);
  });

  it('lets a patient complete their OWN task', async () => {
    const bTask = await raw.task.findFirstOrThrow({ where: { patientId: patientB } });
    const res = await authPost(`/v1/tasks/${bTask.id}/complete`, tokenB)
      .set('Idempotency-Key', `own-${uuidv7()}`)
      .send({});
    expect(res.status).toBe(200);
    const after = await raw.task.findUniqueOrThrow({ where: { id: bTask.id } });
    expect(after.status).toBe(PrismaTaskStatus.completed);
  });

  // -------------------------------------------------------------------------
  // 8. PATCH /me/language — instant
  // -------------------------------------------------------------------------

  it('changes the language instantly + fires language_changed', async () => {
    const res = await authPatch('/v1/me/language', tokenA).send({ language: 'RU' });
    expect(res.status).toBe(200);
    expect(res.body.language).toBe('RU');

    const profile = await authGet('/v1/me/profile', tokenA);
    expect(profile.body.language).toBe('RU');

    const changed = await raw.event.count({
      where: { clinicId, eventName: 'language_changed', patientRef: 'ME-A' },
    });
    expect(changed).toBe(1);
  });

  // -------------------------------------------------------------------------
  // 10. POST /me/app-opened — engagement telemetry
  // -------------------------------------------------------------------------

  it('records an app_opened engagement event (categorical)', async () => {
    const res = await authPost('/v1/me/app-opened', tokenA).send({});
    expect(res.status).toBe(200);
    expect(res.body.recorded).toBe(true);

    const ev = await raw.event.findFirst({
      where: { clinicId, eventName: 'app_opened', patientRef: 'ME-A' },
    });
    expect(ev).not.toBeNull();
    for (const v of Object.values(ev!.payload as Record<string, unknown>)) {
      expect(['string', 'number', 'boolean']).toContain(typeof v);
    }
  });

  // -------------------------------------------------------------------------
  // 7. POST /me/survey — free_text write-only, gated near day 30, idempotent
  // -------------------------------------------------------------------------

  it('rejects the survey before day 30 (A is on day 5)', async () => {
    const res = await authPost('/v1/me/survey', tokenA).send({ q1Helpful: 5 });
    expect(res.status).toBe(403);
  });

  it('accepts the survey near day 30 and stores free_text write-only', async () => {
    const first = await authPost('/v1/me/survey', tokenD).send({
      q1Helpful: 5,
      q2Easy: 4,
      q3AdherenceSupport: 5,
      q4Recommend: 5,
      freeText: SECRET_FREE_TEXT,
    });
    expect(first.status).toBe(201);
    expect(first.body.alreadySubmitted).toBe(false);
    // The response never echoes the free text.
    expect(JSON.stringify(first.body)).not.toContain(SECRET_FREE_TEXT);

    // Idempotent — a second submit records nothing new.
    const second = await authPost('/v1/me/survey', tokenD).send({ q1Helpful: 1, freeText: 'other' });
    expect(second.status).toBe(201);
    expect(second.body.alreadySubmitted).toBe(true);

    const count = await raw.surveyResponse.count({ where: { patientId: patientD } });
    expect(count).toBe(1);
    // The free text WAS persisted (write-only), so it exists on the row...
    const row = await raw.surveyResponse.findFirstOrThrow({ where: { patientId: patientD } });
    expect(row.freeText).toBe(SECRET_FREE_TEXT);
  });

  it('never surfaces survey free_text in GET /v1/metrics', async () => {
    const res = await authGet('/v1/metrics', staffToken);
    expect(res.status).toBe(200);
    expect(res.body.satisfaction.responseCount).toBeGreaterThanOrEqual(1);
    // The write-only free text appears nowhere in the analytics payload.
    expect(JSON.stringify(res.body)).not.toContain(SECRET_FREE_TEXT);
  });

  it('never carries survey free_text in the survey_submitted event payload', async () => {
    const ev = await raw.event.findFirst({
      where: { clinicId, eventName: 'survey_submitted', patientRef: 'ME-D' },
    });
    expect(ev).not.toBeNull();
    expect(JSON.stringify(ev!.payload)).not.toContain(SECRET_FREE_TEXT);
  });

  // -------------------------------------------------------------------------
  // 9. POST /me/leave — halts future tasks, retains history
  // -------------------------------------------------------------------------

  it('self-withdraws: halts future tasks, retains history rows, flags the clinic', async () => {
    const beforePending = await raw.task.count({
      where: { patientId: patientC, status: PrismaTaskStatus.pending },
    });
    expect(beforePending).toBeGreaterThan(0);

    const res = await authPost('/v1/me/leave', tokenC).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('withdrawn');
    expect(res.body.tasksStopped).toBeGreaterThan(0);

    const patient = await raw.patient.findUniqueOrThrow({ where: { id: patientC } });
    expect(patient.status).toBe(PrismaPatientStatus.withdrawn);

    // Future pending tasks removed; the completed history row is RETAINED.
    const futurePending = await raw.task.count({
      where: { patientId: patientC, status: PrismaTaskStatus.pending, windowClosesAt: { gt: NOW } },
    });
    expect(futurePending).toBe(0);
    const retained = await raw.task.count({
      where: { patientId: patientC, status: PrismaTaskStatus.completed },
    });
    expect(retained).toBe(1);

    // Clinic flagged via the append-only event stream.
    const withdrawn = await raw.event.count({
      where: { clinicId, eventName: 'patient_withdrawn', patientRef: 'ME-C' },
    });
    expect(withdrawn).toBe(1);

    // Idempotent: leaving again stops nothing further.
    const again = await authPost('/v1/me/leave', tokenC).send({});
    expect(again.status).toBe(200);
    expect(again.body.tasksStopped).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Seed / cleanup (raw client — bypasses tenancy/immutability extensions).
// ---------------------------------------------------------------------------

async function seed(db: PrismaClient): Promise<void> {
  await cleanup(db);

  const clinicBase = {
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
  };

  await db.clinic.create({ data: { id: clinicId, name: 'Clinic Me (e2e)', ...clinicBase } });
  await db.clinic.create({ data: { id: otherClinicId, name: 'Clinic Other (e2e)', ...clinicBase } });

  await db.staff.create({
    data: {
      id: staffId,
      clinicId,
      name: 'Nurse Me',
      email: `nurse-me-${staffId}@e2e.example`,
      passwordHash: 'not-used',
      role: StaffRole.staff,
      active: true,
    },
  });

  await db.recoveryPlan.create({
    data: { id: planId, clinicId, procedureType: PROCEDURE, name: 'E2E Me Plan', durationDays: 30 },
  });

  await db.planItem.createMany({
    data: [
      { planId, recoveryDay: 5, taskType: PrismaTaskType.medication, contentRef: 'medication.paracetamol_500', scheduledTime: '08:00', windowMinutes: 120 },
      { planId, recoveryDay: 5, taskType: PrismaTaskType.wound_care, contentRef: 'wound_care.daily', scheduledTime: '10:00', windowMinutes: 180 },
      { planId, recoveryDay: 5, taskType: PrismaTaskType.checkin, contentRef: 'checkin.daily', scheduledTime: '19:00', windowMinutes: 360 },
      { planId, recoveryDay: 1, taskType: PrismaTaskType.education, contentRef: `clinical.${PROCEDURE}.day_1`, scheduledTime: '12:00', windowMinutes: 720 },
      { planId, recoveryDay: 3, taskType: PrismaTaskType.education, contentRef: `clinical.${PROCEDURE}.day_3`, scheduledTime: '12:00', windowMinutes: 720 },
      { planId, recoveryDay: 5, taskType: PrismaTaskType.education, contentRef: `clinical.${PROCEDURE}.day_5`, scheduledTime: '12:00', windowMinutes: 720 },
      { planId, recoveryDay: 7, taskType: PrismaTaskType.education, contentRef: `clinical.${PROCEDURE}.day_7`, scheduledTime: '12:00', windowMinutes: 720 },
    ],
  });

  const base = {
    clinicId,
    phone: '+998900000000',
    ageBand: '30-39',
    procedureType: PROCEDURE,
    language: PrismaLanguage.EN,
    planId,
  };

  // A — day 5, starts `enrolled` (consent will activate it).
  await db.patient.create({
    data: {
      ...base,
      id: patientA,
      patientRef: 'ME-A',
      name: 'Alice Appleseed',
      dischargeDate: new Date(NOW.getTime() - 5 * DAY),
      status: PrismaPatientStatus.enrolled,
      enrolmentCode: `MEA${uuidv7().replace(/-/g, '').slice(0, 4).toUpperCase()}`,
    },
  });

  // B — day 5, active (cross-patient target).
  await db.patient.create({
    data: {
      ...base,
      id: patientB,
      patientRef: 'ME-B',
      name: 'Bob Barnacle',
      dischargeDate: new Date(NOW.getTime() - 5 * DAY),
      status: PrismaPatientStatus.active,
      enrolmentCode: `MEB${uuidv7().replace(/-/g, '').slice(0, 4).toUpperCase()}`,
    },
  });

  // C — day 3, active (leave test); tasks created manually below.
  await db.patient.create({
    data: {
      ...base,
      id: patientC,
      patientRef: 'ME-C',
      name: 'Carol Cinder',
      dischargeDate: new Date(NOW.getTime() - 3 * DAY),
      status: PrismaPatientStatus.active,
      enrolmentCode: `MEC${uuidv7().replace(/-/g, '').slice(0, 4).toUpperCase()}`,
    },
  });

  // D — day 30, active (survey test).
  await db.patient.create({
    data: {
      ...base,
      id: patientD,
      patientRef: 'ME-D',
      name: 'Dan Dune',
      dischargeDate: new Date(NOW.getTime() - 30 * DAY),
      status: PrismaPatientStatus.active,
      enrolmentCode: `MED${uuidv7().replace(/-/g, '').slice(0, 4).toUpperCase()}`,
    },
  });

  // C's history: one PAST completed task (retained on leave) + one FUTURE pending
  // task (removed on leave).
  await db.task.create({
    data: {
      patientId: patientC,
      taskType: PrismaTaskType.medication,
      scheduledFor: new Date(NOW.getTime() - 4 * DAY),
      windowClosesAt: new Date(NOW.getTime() - 4 * DAY),
      recoveryDay: 1,
      status: PrismaTaskStatus.completed,
      completedAt: new Date(NOW.getTime() - 4 * DAY),
      onTime: true,
    },
  });
  await db.task.create({
    data: {
      patientId: patientC,
      taskType: PrismaTaskType.medication,
      scheduledFor: new Date(NOW.getTime() + 5 * DAY),
      windowClosesAt: new Date(NOW.getTime() + 5 * DAY),
      recoveryDay: 10,
      status: PrismaTaskStatus.pending,
    },
  });
}

async function cleanup(db: PrismaClient): Promise<void> {
  const clinics = [clinicId, otherClinicId];
  await db.event.deleteMany({ where: { clinicId: { in: clinics } } });
  await db.surveyResponse.deleteMany({ where: { patient: { clinicId: { in: clinics } } } });
  await db.task.deleteMany({ where: { patient: { clinicId: { in: clinics } } } });
  await db.consent.deleteMany({ where: { patient: { clinicId: { in: clinics } } } });
  await db.patient.deleteMany({ where: { clinicId: { in: clinics } } });
  await db.planItem.deleteMany({ where: { plan: { clinicId: { in: clinics } } } });
  await db.recoveryPlan.deleteMany({ where: { clinicId: { in: clinics } } });
  await db.staff.deleteMany({ where: { clinicId: { in: clinics } } });
  await db.clinic.deleteMany({ where: { id: { in: clinics } } });
}
