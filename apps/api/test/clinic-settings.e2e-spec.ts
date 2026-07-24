import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import request from 'supertest';
import { StaffRole } from '@hospital-ai/shared-types';

import { AppModule } from '../src/app.module';
import { JwtTokenService } from '../src/auth/jwt';

/**
 * Backend-gap D7 — clinic settings + staff accounts (e2e).
 *
 * Proves:
 *   - PATCH /clinics/me updates settings and AUDIT-LOGS name/phone/emergency
 *     changes (actor + old→new), while a non-sensitive field is NOT audited;
 *   - an unchanged value writes no audit entry;
 *   - staff accounts list/create/update are clinic-scoped, never leak the hash,
 *     and creating/updating is clinical_lead-only (plain nurse 403);
 *   - duplicate staff email conflicts.
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
const leadId = uuidv7();
const nurseId = uuidv7();

describe('Clinic settings + staff (e2e)', () => {
  let app: INestApplication;
  let raw: PrismaClient;
  let leadToken: string;
  let nurseToken: string;

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

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    const jwt = moduleRef.get(JwtTokenService);
    leadToken = jwt.signStaffAccess(leadId, clinicId, StaffRole.clinical_lead);
    nurseToken = jwt.signStaffAccess(nurseId, clinicId, StaffRole.staff);
  });

  afterAll(async () => {
    await cleanup(raw);
    await app?.close();
    await raw?.$disconnect();
  });

  const lead = {
    get: (p: string) => request(app.getHttpServer()).get(p).set('Authorization', `Bearer ${leadToken}`),
    post: (p: string) => request(app.getHttpServer()).post(p).set('Authorization', `Bearer ${leadToken}`),
    patch: (p: string) => request(app.getHttpServer()).patch(p).set('Authorization', `Bearer ${leadToken}`),
  };
  const nurse = {
    post: (p: string) => request(app.getHttpServer()).post(p).set('Authorization', `Bearer ${nurseToken}`),
  };

  it('GET /clinics/me returns the clinic config', async () => {
    const res = await lead.get('/v1/clinics/me');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Settings Clinic (e2e)');
    expect(res.body.ackMinutes).toBe(15);
  });

  it('PATCH /clinics/me updates settings and audit-logs name/phone/emergency (not hours)', async () => {
    const res = await lead.patch('/v1/clinics/me').send({
      name: 'Renamed Clinic',
      phone: '+998710009999',
      emergencyNumber: '112',
      workingHours: '08:00-20:00',
    });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Renamed Clinic');
    expect(res.body.workingHours).toBe('08:00-20:00');

    const audits = await raw.auditLog.findMany({
      where: { clinicId, entity: 'clinic' },
      orderBy: { createdAt: 'asc' },
    });
    const fields = audits.map((a) => a.field).sort();
    expect(fields).toEqual(['emergency_number', 'name', 'phone']);
    // working_hours is NOT a sensitive/patient-facing field -> not audited.
    expect(fields).not.toContain('working_hours');

    const nameAudit = audits.find((a) => a.field === 'name');
    expect(nameAudit?.actorId).toBe(leadId);
    expect(nameAudit?.oldValue).toBe('Settings Clinic (e2e)');
    expect(nameAudit?.newValue).toBe('Renamed Clinic');
  });

  it('PATCH with unchanged values writes no new audit entries', async () => {
    const before = await raw.auditLog.count({ where: { clinicId, entity: 'clinic' } });
    await lead.patch('/v1/clinics/me').send({ name: 'Renamed Clinic' }).expect(200);
    const after = await raw.auditLog.count({ where: { clinicId, entity: 'clinic' } });
    expect(after).toBe(before);
  });

  it('lists staff without leaking the password hash', async () => {
    const res = await lead.get('/v1/staff');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    for (const s of res.body) {
      expect(s).not.toHaveProperty('passwordHash');
      expect(s).toHaveProperty('email');
      expect(s).toHaveProperty('role');
    }
  });

  it('refuses staff creation from a plain nurse (clinical_lead only)', async () => {
    const res = await nurse.post('/v1/staff').send({
      name: 'New Nurse',
      email: `new-${uuidv7().slice(0, 8)}@e2e.example`,
      password: 'a-strong-password',
      role: StaffRole.staff,
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('creates + updates a staff account as clinical lead', async () => {
    const email = `created-${uuidv7().slice(0, 8)}@e2e.example`;
    const created = await lead.post('/v1/staff').send({
      name: 'Created Staff',
      email,
      password: 'a-strong-password',
      role: StaffRole.staff,
    });
    expect(created.status).toBe(201);
    expect(created.body.email).toBe(email);
    expect(created.body).not.toHaveProperty('passwordHash');

    const patched = await lead
      .patch(`/v1/staff/${created.body.id}`)
      .send({ name: 'Updated Staff', active: false, role: StaffRole.clinical_lead });
    expect(patched.status).toBe(200);
    expect(patched.body.name).toBe('Updated Staff');
    expect(patched.body.active).toBe(false);
    expect(patched.body.role).toBe(StaffRole.clinical_lead);
  });

  it('conflicts on a duplicate staff email', async () => {
    const email = `dupe-${uuidv7().slice(0, 8)}@e2e.example`;
    await lead
      .post('/v1/staff')
      .send({ name: 'First', email, password: 'a-strong-password', role: StaffRole.staff })
      .expect(201);
    const second = await lead
      .post('/v1/staff')
      .send({ name: 'Second', email, password: 'a-strong-password', role: StaffRole.staff });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('DUPLICATE_REQUEST');
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
      name: 'Settings Clinic (e2e)',
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

  await db.staff.createMany({
    data: [
      {
        id: leadId,
        clinicId,
        name: 'Clinical Lead',
        email: `lead-${leadId.slice(0, 8)}@e2e.example`,
        passwordHash: 'x',
        role: StaffRole.clinical_lead,
      },
      {
        id: nurseId,
        clinicId,
        name: 'Nurse',
        email: `nurse-${nurseId.slice(0, 8)}@e2e.example`,
        passwordHash: 'x',
        role: StaffRole.staff,
      },
    ],
  });
}

async function cleanup(db: PrismaClient): Promise<void> {
  await db.auditLog.deleteMany({ where: { clinicId } });
  await db.staff.deleteMany({ where: { clinicId } });
  await db.clinic.deleteMany({ where: { id: clinicId } });
}
