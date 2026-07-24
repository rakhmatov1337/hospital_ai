import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ContentStatus as PrismaContentStatus,
  Language as PrismaLanguage,
  PrismaClient,
} from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import request from 'supertest';
import { PLACEHOLDER_APPROVED_BY, StaffRole } from '@hospital-ai/shared-types';

import { AppModule } from '../src/app.module';
import { JwtTokenService } from '../src/auth/jwt';

/**
 * Backend-gap D8 — content approval (e2e).
 *
 * Proves:
 *   - list / item-detail expose per-language review state + version history;
 *   - approve is per item PER language and clinical_lead-only (plain staff 403);
 *   - approving is immutable: re-approving an approved row 409s, and approving a
 *     placeholder supersedes it with a NEW real approved version (old row kept);
 *   - request-changes creates a NEW Draft version (never mutates the approved row);
 *   - the unapproved-count launch-blocker drops when an item is fully approved;
 *   - GET /content/unapproved-count resolves ahead of the GET /content/:key wildcard;
 *   - every approval is recorded to the append-only AuditLog.
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
const draftItemId = uuidv7();
const placeholderItemId = uuidv7();

// Translation ids so the tests can target them directly.
const enDraftId = uuidv7();
const uzDraftId = uuidv7();
const ruDraftId = uuidv7();
const placeholderEnId = uuidv7();

describe('Content approval (e2e)', () => {
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

  const asLead = {
    get: (p: string) => request(app.getHttpServer()).get(p).set('Authorization', `Bearer ${leadToken}`),
    post: (p: string) => request(app.getHttpServer()).post(p).set('Authorization', `Bearer ${leadToken}`),
  };
  const asNurse = {
    post: (p: string) => request(app.getHttpServer()).post(p).set('Authorization', `Bearer ${nurseToken}`),
  };

  it('requires a staff token', async () => {
    const res = await request(app.getHttpServer()).get('/v1/content');
    expect(res.status).toBe(401);
  });

  it('lists the clinic item with per-language review state', async () => {
    const res = await asLead.get('/v1/content');
    expect(res.status).toBe(200);
    const mine = res.body.find((i: { id: string }) => i.id === draftItemId);
    expect(mine).toBeTruthy();
    expect(mine.status).toBe('needs_review');
    expect(mine.needsApproval).toBe(true);
    expect(mine.languagesPresent.sort()).toEqual(['EN', 'RU', 'UZ']);
    expect(mine.missingLanguages).toEqual([]);
  });

  it('item detail returns the three languages side by side with history', async () => {
    const res = await asLead.get(`/v1/content/items/${draftItemId}`);
    expect(res.status).toBe(200);
    expect(res.body.languages).toHaveLength(3);
    const en = res.body.languages.find((l: { language: string }) => l.language === 'EN');
    expect(en.present).toBe(true);
    expect(en.reviewStatus).toBe('draft');
    expect(en.current.version).toBe(1);
    expect(en.history).toHaveLength(1);
  });

  it('GET /content/unapproved-count resolves (not swallowed by :key) and counts my draft item', async () => {
    const res = await asLead.get('/v1/content/unapproved-count');
    expect(res.status).toBe(200);
    expect(typeof res.body.unapprovedItems).toBe('number');
    expect(res.body.unapprovedItems).toBeGreaterThanOrEqual(1);
  });

  it('refuses approval from a plain nurse (clinical_lead only)', async () => {
    const res = await asNurse.post(`/v1/content/translations/${enDraftId}/approve`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('approves per language: EN alone does not approve the item', async () => {
    const res = await asLead.post(`/v1/content/translations/${enDraftId}/approve`);
    expect(res.status).toBe(200);
    expect(res.body.reviewStatus).toBe('approved');
    expect(res.body.language).toBe('EN');

    const item = await asLead.get(`/v1/content/items/${draftItemId}`);
    expect(item.body.status).toBe('needs_review'); // UZ + RU still pending
  });

  it('re-approving an already-approved translation is a conflict (immutable)', async () => {
    const res = await asLead.post(`/v1/content/translations/${enDraftId}/approve`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE_REQUEST');
  });

  it('fully approving all three languages flips the item to approved and drops the count', async () => {
    const before = (await asLead.get('/v1/content/unapproved-count')).body.unapprovedItems;

    await asLead.post(`/v1/content/translations/${uzDraftId}/approve`).expect(200);
    await asLead.post(`/v1/content/translations/${ruDraftId}/approve`).expect(200);

    const item = await asLead.get(`/v1/content/items/${draftItemId}`);
    expect(item.body.status).toBe('approved');

    const after = (await asLead.get('/v1/content/unapproved-count')).body.unapprovedItems;
    expect(after).toBe(before - 1);
  });

  it('records every approval in the append-only AuditLog', async () => {
    const audits = await raw.auditLog.findMany({
      where: { clinicId, entity: 'content_translation', field: 'approve' },
    });
    expect(audits.length).toBeGreaterThanOrEqual(3); // EN + UZ + RU
    expect(audits.every((a) => a.actorId === leadId)).toBe(true);
  });

  it('request-changes creates a NEW Draft version and reverts the item to needs_review', async () => {
    const res = await asLead
      .post(`/v1/content/translations/${enDraftId}/request-changes`)
      .send({ note: 'Tighten the wording', text: 'Revised EN text' });
    expect(res.status).toBe(200);
    expect(res.body.reviewStatus).toBe('draft');
    expect(res.body.version).toBe(2); // new version above the approved v1

    // The approved v1 row is untouched (immutability preserved).
    const v1 = await raw.contentTranslation.findUnique({ where: { id: enDraftId } });
    expect(v1?.status).toBe('approved');

    const item = await asLead.get(`/v1/content/items/${draftItemId}`);
    expect(item.body.status).toBe('needs_review');
  });

  it('approving a placeholder supersedes it with a NEW real approved version', async () => {
    const res = await asLead.post(`/v1/content/translations/${placeholderEnId}/approve`);
    expect(res.status).toBe(200);
    expect(res.body.reviewStatus).toBe('approved');
    expect(res.body.version).toBe(2);

    // The original placeholder row is preserved, unmutated.
    const placeholder = await raw.contentTranslation.findUnique({
      where: { id: placeholderEnId },
    });
    expect(placeholder?.isPlaceholder).toBe(true);
    expect(placeholder?.approvedBy).toBe(PLACEHOLDER_APPROVED_BY);
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
      name: 'Content Clinic (e2e)',
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

  // A clinic-scoped item with three DRAFT translations (the approval workflow).
  await db.contentItem.create({
    data: {
      id: draftItemId,
      clinicId,
      category: 'onboarding',
      contentKey: `e2e.approve.${draftItemId.slice(0, 8)}`,
      status: PrismaContentStatus.draft,
      translations: {
        create: [
          { id: enDraftId, language: PrismaLanguage.EN, text: 'EN draft', version: 1, status: PrismaContentStatus.draft },
          { id: uzDraftId, language: PrismaLanguage.UZ, text: 'UZ draft', version: 1, status: PrismaContentStatus.draft },
          { id: ruDraftId, language: PrismaLanguage.RU, text: 'RU draft', version: 1, status: PrismaContentStatus.draft },
        ],
      },
    },
  });

  // A clinic-scoped item with a placeholder-approved EN translation (needs real sign-off).
  await db.contentItem.create({
    data: {
      id: placeholderItemId,
      clinicId,
      category: 'app',
      contentKey: `e2e.placeholder.${placeholderItemId.slice(0, 8)}`,
      status: PrismaContentStatus.approved,
      translations: {
        create: [
          {
            id: placeholderEnId,
            language: PrismaLanguage.EN,
            text: 'EN placeholder',
            version: 1,
            status: PrismaContentStatus.approved,
            isPlaceholder: true,
            approvedBy: PLACEHOLDER_APPROVED_BY,
            approvedAt: new Date(),
          },
        ],
      },
    },
  });
}

async function cleanup(db: PrismaClient): Promise<void> {
  await db.auditLog.deleteMany({ where: { clinicId } });
  await db.contentTranslation.deleteMany({
    where: { contentItem: { clinicId } },
  });
  await db.contentItem.deleteMany({ where: { clinicId } });
  await db.staff.deleteMany({ where: { clinicId } });
  await db.clinic.deleteMany({ where: { id: clinicId } });
}
