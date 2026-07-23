import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ContentStatus as PrismaContentStatus,
  Language as PrismaLanguage,
  PrismaClient,
  TaskType as PrismaTaskType,
} from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import request from 'supertest';
import { ERROR_CODES, Language, StaffRole } from '@hospital-ai/shared-types';

import { AppModule } from '../src/app.module';
import { EnvConfig } from '../src/config/env.validation';
import { JwtTokenService } from '../src/auth/jwt';

/**
 * Task 6 negative + happy tests:
 *  (1) the production gate blocks enrolment (CLINICAL_CONTENT_NOT_APPROVED);
 *  (2) a cross-clinic patient read is forbidden (CROSS_CLINIC_FORBIDDEN);
 *  (3) a gated-open enrolment creates the patient and generates its task set.
 *
 * The suite owns its content landscape: the production gate requires EVERY
 * content item visible to the clinic (clinic-owned or global) to carry a real
 * approved sign-off, so the test wipes content and seeds exactly one approved
 * item for the enrolling clinic — otherwise unrelated placeholder seed content
 * would (correctly) keep the gate closed.
 */

// Load DATABASE_URL from apps/api/.env if the runner hasn't exported it — the
// raw PrismaClient and the app both read process.env.DATABASE_URL at construction.
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
    // left to fail loudly on first DB call if truly unset
  }
}

const clinicAId = uuidv7();
const clinicBId = uuidv7();
const staffAId = uuidv7();
const planAId = uuidv7();
const patientBId = uuidv7();
const contentItemAId = uuidv7();

const PROCEDURE = 'e2e_procedure';

describe('Enrolment + clinic scoping (e2e)', () => {
  let app: INestApplication;
  let raw: PrismaClient;
  let jwt: JwtTokenService;
  let staffAToken: string;

  // Mutable env so a single app can exercise gate-closed and gate-open states.
  const testEnv = new EnvConfig();

  beforeAll(async () => {
    ensureDatabaseUrl();

    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    process.env.JWT_PRIVATE_KEY = privateKey;
    process.env.JWT_PUBLIC_KEY = publicKey;

    testEnv.NODE_ENV = 'test';
    testEnv.DATABASE_URL = process.env.DATABASE_URL as string;
    testEnv.ALLOW_PLACEHOLDER_CONTENT = true;
    testEnv.PATIENT_ENROLMENT_ENABLED = false;

    raw = new PrismaClient();
    await raw.$connect();
    await seed(raw);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EnvConfig)
      .useValue(testEnv)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    jwt = moduleRef.get(JwtTokenService);
    staffAToken = jwt.signStaffAccess(staffAId, clinicAId, StaffRole.staff);
  });

  afterAll(async () => {
    await cleanup(raw);
    await app?.close();
    await raw?.$disconnect();
  });

  const enrolBody = () => ({
    name: 'Patient One',
    phone: '+998900000001',
    ageBand: '30-39',
    procedureType: PROCEDURE,
    dischargeDate: '2026-07-20',
    language: Language.EN,
    consentVersion: 'v1.0',
    consentTextSnapshot: 'Consent text accepted by the patient at enrolment.',
  });

  it('blocks enrolment when the production gate is closed (CLINICAL_CONTENT_NOT_APPROVED)', async () => {
    testEnv.PATIENT_ENROLMENT_ENABLED = false;

    const res = await request(app.getHttpServer())
      .post('/v1/patients')
      .set('Authorization', `Bearer ${staffAToken}`)
      .send(enrolBody());

    expect(res.status).toBe(403);
    expect(res.body.code).toBe(ERROR_CODES.CLINICAL_CONTENT_NOT_APPROVED);
  });

  it('forbids reading a patient that belongs to another clinic (CROSS_CLINIC_FORBIDDEN)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/patients/${patientBId}`)
      .set('Authorization', `Bearer ${staffAToken}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe(ERROR_CODES.CROSS_CLINIC_FORBIDDEN);
  });

  it('enrols a patient and generates the task set when the gate is open', async () => {
    testEnv.PATIENT_ENROLMENT_ENABLED = true;

    const res = await request(app.getHttpServer())
      .post('/v1/patients')
      .set('Authorization', `Bearer ${staffAToken}`)
      .send(enrolBody());

    expect(res.status).toBe(201);
    expect(res.body.enrolmentCode).toHaveLength(6);
    expect(res.body.patient.status).toBe('enrolled');
    expect(res.body.tasksGenerated).toBeGreaterThan(0);

    const patientId: string = res.body.patient.id;
    const taskCount = await raw.task.count({ where: { patientId } });
    expect(taskCount).toBe(res.body.tasksGenerated);

    const consentCount = await raw.consent.count({ where: { patientId } });
    expect(consentCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Seed / cleanup (raw client — bypasses the immutability + tenancy extensions).
// ---------------------------------------------------------------------------

async function seed(db: PrismaClient): Promise<void> {
  await cleanup(db);

  // Content landscape must be fully controlled for the gate to be deterministic.
  await db.contentTranslation.deleteMany({});
  await db.contentItem.deleteMany({});

  const clinicBase = {
    phone: '+998710000000',
    emergencyNumber: '103',
    workingHours: '09:00-18:00',
    workingDays: 'Mon-Sat',
    timezone: 'Asia/Tashkent',
    notifyMinutes: 5,
    ackMinutes: 15,
    breachMinutes: 30,
  };

  await db.clinic.create({
    data: { id: clinicAId, name: 'Clinic A (e2e)', ...clinicBase },
  });
  await db.clinic.create({
    data: { id: clinicBId, name: 'Clinic B (e2e)', ...clinicBase },
  });

  await db.staff.create({
    data: {
      id: staffAId,
      clinicId: clinicAId,
      name: 'Nurse A',
      email: `nurse-a-${staffAId}@e2e.example`,
      passwordHash: 'not-used-in-this-suite',
      role: StaffRole.staff,
      active: true,
    },
  });

  await db.recoveryPlan.create({
    data: {
      id: planAId,
      clinicId: clinicAId,
      procedureType: PROCEDURE,
      name: 'E2E Plan',
      durationDays: 30,
    },
  });

  await db.planItem.createMany({
    data: [
      {
        planId: planAId,
        recoveryDay: 1,
        taskType: PrismaTaskType.medication,
        contentRef: 'medication.paracetamol_500',
        scheduledTime: '08:00',
        windowMinutes: 120,
      },
      {
        planId: planAId,
        recoveryDay: 1,
        taskType: PrismaTaskType.wound_care,
        contentRef: 'wound_care.daily',
        scheduledTime: '10:00',
        windowMinutes: 180,
      },
      {
        planId: planAId,
        recoveryDay: 2,
        taskType: PrismaTaskType.checkin,
        contentRef: 'checkin.daily',
        scheduledTime: '19:00',
        windowMinutes: 360,
      },
    ],
  });

  // A patient in clinic B — the cross-clinic read target.
  await db.patient.create({
    data: {
      id: patientBId,
      clinicId: clinicBId,
      patientRef: `PT-B-${patientBId.slice(0, 8)}`,
      name: 'Patient B',
      phone: '+998900000002',
      ageBand: '40-49',
      procedureType: PROCEDURE,
      dischargeDate: new Date('2026-07-18'),
      language: PrismaLanguage.EN,
      enrolmentCode: `B${uuidv7().replace(/-/g, '').slice(0, 5).toUpperCase()}`,
    },
  });

  // The one approved, non-placeholder content item that lets the gate open.
  await db.contentItem.create({
    data: {
      id: contentItemAId,
      clinicId: clinicAId,
      category: 'onboarding',
      contentKey: 'onboarding.welcome',
      status: PrismaContentStatus.approved,
      translations: {
        create: {
          language: PrismaLanguage.EN,
          text: 'Approved onboarding text (e2e).',
          version: 1,
          approvedBy: 'e2e-clinician',
          approvedAt: new Date(),
          status: PrismaContentStatus.approved,
          isPlaceholder: false,
        },
      },
    },
  });
}

async function cleanup(db: PrismaClient): Promise<void> {
  await db.task.deleteMany({ where: { patient: { clinicId: { in: [clinicAId, clinicBId] } } } });
  await db.consent.deleteMany({ where: { patient: { clinicId: { in: [clinicAId, clinicBId] } } } });
  await db.patient.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } });
  await db.planItem.deleteMany({ where: { plan: { clinicId: { in: [clinicAId, clinicBId] } } } });
  await db.recoveryPlan.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } });
  await db.contentTranslation.deleteMany({
    where: { contentItem: { clinicId: { in: [clinicAId, clinicBId] } } },
  });
  await db.contentItem.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } });
  await db.staff.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } });
  await db.clinic.deleteMany({ where: { id: { in: [clinicAId, clinicBId] } } });
}
