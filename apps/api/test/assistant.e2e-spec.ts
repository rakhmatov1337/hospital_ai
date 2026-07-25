import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ContentStatus,
  Language as PrismaLanguage,
  PatientStatus as PrismaPatientStatus,
  PrismaClient,
} from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { Clock, FixedClock } from '../src/common/clock';
import { JwtTokenService } from '../src/auth/jwt';
import { StaffRole } from '@hospital-ai/shared-types';

/**
 * SP7 — Patient Assistant (e2e).
 *
 * Proves the DETERMINISTIC safety behaviour, which needs no AI key or model:
 *   - a red-flag message is answered from APPROVED emergency content, bypassing
 *     the model, and fires assistant_emergency_surfaced;
 *   - with no AI provider configured, a benign message routes to approved
 *     contact-clinic content (never a silent failure, never a model answer);
 *   - the assistant is patient-scoped: a staff token is rejected, and a thread
 *     cannot be read across patients;
 *   - telemetry carries NO message body.
 *
 * The model-in-the-loop grounding behaviour is validated separately by the guard
 * unit specs + the QA gate (which asserts the guards wrap every call), not here.
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

const NOW = new Date('2026-06-30T06:00:00Z'); // 11:00 Asia/Tashkent, in-hours
const clock = new FixedClock(NOW);

const clinicId = uuidv7();
const staffId = uuidv7();
const patientId = uuidv7();
const otherPatientId = uuidv7();

/** Parse the SSE body supertest returns into an array of chunk objects. */
function parseSse(body: string): Array<Record<string, unknown>> {
  return body
    .split('\n\n')
    .map((l) => l.replace(/^data: /, '').trim())
    .filter(Boolean)
    .map((j) => JSON.parse(j));
}

describe('Patient Assistant API (e2e)', () => {
  let app: INestApplication;
  let raw: PrismaClient;
  let token: string;
  let otherToken: string;
  let staffToken: string;
  // Guard against a stray provider key in the local env — this suite asserts the
  // no-model (feature-gated) path for benign messages.
  const savedKeys: Record<string, string | undefined> = {};

  beforeAll(async () => {
    ensureDatabaseUrl();
    // Force the assistant into its no-model (feature-gated) path. Set to '' rather
    // than delete: dotenv (via @nestjs/config) does NOT override an already-set
    // env var, so ConfigModule cannot repopulate these from .env at app init.
    for (const k of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY']) {
      savedKeys[k] = process.env[k];
      process.env[k] = '';
    }

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

    const jwt = moduleRef.get(JwtTokenService);
    token = jwt.signPatientAccess(patientId, clinicId);
    otherToken = jwt.signPatientAccess(otherPatientId, clinicId);
    staffToken = jwt.signStaffAccess(staffId, clinicId, StaffRole.staff);
  });

  afterAll(async () => {
    await cleanup(raw);
    await app?.close();
    await raw?.$disconnect();
    for (const [k, v] of Object.entries(savedKeys)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  const authPost = (path: string, tok: string) =>
    request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${tok}`);
  const authGet = (path: string, tok: string) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${tok}`);

  it('rejects an unauthenticated message with 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/me/assistant/messages')
      .send({ message: 'hello' });
    expect(res.status).toBe(401);
  });

  it('rejects a staff token on the patient assistant with 403', async () => {
    const res = await authPost('/v1/me/assistant/messages', staffToken).send({ message: 'hello' });
    expect(res.status).toBe(403);
  });

  it('answers a red-flag message from APPROVED emergency content, bypassing the model', async () => {
    const res = await authPost('/v1/me/assistant/messages', token).send({
      message: 'I have chest pain and it is hard to breathe',
    });
    expect(res.status).toBe(201);
    const chunks = parseSse(res.text);
    const done = chunks.find((c) => c.type === 'done')!;
    expect(done.verdict).toBe('red_flag_bypass');
    expect(done.contentKey).toBe('emergency.headline');

    const delta = chunks.find((c) => c.type === 'delta')!;
    expect(String(delta.text)).toContain('103'); // the approved emergency instruction

    // The emergency route fired its telemetry, with NO message body.
    const ev = await raw.event.findFirst({
      where: { clinicId, eventName: 'assistant_emergency_surfaced' },
    });
    expect(ev).toBeTruthy();
    expect(JSON.stringify(ev!.payload)).not.toContain('chest pain');
  });

  it('routes a benign message to approved contact-clinic content when no model is configured', async () => {
    const res = await authPost('/v1/me/assistant/messages', token).send({
      message: 'When should I take my paracetamol?',
    });
    expect(res.status).toBe(201);
    const chunks = parseSse(res.text);
    const done = chunks.find((c) => c.type === 'done')!;
    expect(done.verdict).toBe('replaced');
    expect(done.contentKey).toBe('contact.body');

    // assistant_message_sent fired and carries no free text.
    const ev = await raw.event.findFirst({
      where: { clinicId, eventName: 'assistant_message_sent' },
    });
    expect(ev).toBeTruthy();
    expect(JSON.stringify(ev!.payload)).not.toContain('paracetamol');
  });

  it('persists threads and serves history, scoped to the patient', async () => {
    const created = await authPost('/v1/me/assistant/threads', token).send({});
    expect(created.status).toBe(201);
    const threadId = created.body.id as string;

    await authPost('/v1/me/assistant/messages', token).send({
      threadId,
      message: 'Remind me what my clinic said',
    });

    const history = await authGet(`/v1/me/assistant/threads/${threadId}`, token);
    expect(history.status).toBe(200);
    expect(history.body.messages.length).toBeGreaterThanOrEqual(2); // user + assistant

    // A different patient cannot read this thread.
    const cross = await authGet(`/v1/me/assistant/threads/${threadId}`, otherToken);
    expect(cross.status).toBe(404);
  });
});

async function seed(db: PrismaClient): Promise<void> {
  await cleanup(db);

  await db.clinic.create({
    data: {
      id: clinicId,
      name: 'Assistant Clinic (e2e)',
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

  await db.staff.create({
    data: {
      id: staffId,
      clinicId,
      name: 'Nurse',
      email: `nurse-asst-${staffId}@e2e.example`,
      passwordHash: 'not-used',
      role: StaffRole.staff,
      active: true,
    },
  });

  const patientBase = {
    clinicId,
    phone: '+998900000000',
    ageBand: '30-39',
    procedureType: 'laparoscopic_appendectomy',
    language: PrismaLanguage.EN,
    status: PrismaPatientStatus.active,
    dischargeDate: new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000),
  };
  await db.patient.create({
    data: {
      ...patientBase,
      id: patientId,
      patientRef: 'ASST-A',
      name: 'Alice Assistant',
      enrolmentCode: `ASA${uuidv7().replace(/-/g, '').slice(0, 4).toUpperCase()}`,
    },
  });
  await db.patient.create({
    data: {
      ...patientBase,
      id: otherPatientId,
      patientRef: 'ASST-B',
      name: 'Bob Assistant',
      enrolmentCode: `ASB${uuidv7().replace(/-/g, '').slice(0, 4).toUpperCase()}`,
    },
  });

  // The two approved content strings the guards surface (real sign-off, not
  // placeholder, so resolution works regardless of ALLOW_PLACEHOLDER_CONTENT).
  const items: Array<[string, string, string]> = [
    ['emergency.headline', 'safety', "Your clinic's instruction: call 103 now."],
    ['contact.body', 'contact', 'Call {CLINIC_NAME} on {CLINIC_PHONE}. In an emergency, call 103.'],
  ];
  for (const [contentKey, category, text] of items) {
    const item = await db.contentItem.create({
      data: { clinicId: null, category, contentKey, status: ContentStatus.approved },
    });
    await db.contentTranslation.create({
      data: {
        contentItemId: item.id,
        language: PrismaLanguage.EN,
        text,
        version: 1,
        status: ContentStatus.approved,
        isPlaceholder: false,
        approvedBy: 'e2e',
        approvedAt: NOW,
      },
    });
  }
}

async function cleanup(db: PrismaClient): Promise<void> {
  await db.assistantMessage.deleteMany({
    where: { thread: { clinicId } },
  });
  await db.assistantThread.deleteMany({ where: { clinicId } });
  await db.event.deleteMany({ where: { clinicId } });
  await db.patient.deleteMany({ where: { clinicId } });
  await db.staff.deleteMany({ where: { clinicId } });
  await db.contentTranslation.deleteMany({
    where: { contentItem: { contentKey: { in: ['emergency.headline', 'contact.body'] }, clinicId: null } },
  });
  await db.contentItem.deleteMany({
    where: { contentKey: { in: ['emergency.headline', 'contact.body'] }, clinicId: null },
  });
  await db.clinic.deleteMany({ where: { id: clinicId } });
}
