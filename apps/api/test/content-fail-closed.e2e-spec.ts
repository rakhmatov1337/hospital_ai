import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PrismaClient,
  ContentStatus as PrismaContentStatus,
  Language as PrismaLanguage,
} from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import { ERROR_CODES, Language, PLACEHOLDER_APPROVED_BY } from '@hospital-ai/shared-types';

import { PrismaService } from '../src/prisma/prisma.service';
import { ContentService } from '../src/content/content.service';
import { RequestContext } from '../src/common/request-context';

/**
 * MANDATORY negative test (3): unapproved / placeholder content fails CLOSED.
 *
 * The resolver returns text ONLY for a `status=approved`, non-placeholder
 * translation in the EXACT requested language. Everything else — a draft-only
 * key, a missing key, or a placeholder translation while
 * `ALLOW_PLACEHOLDER_CONTENT=false` — throws CONTENT_NOT_APPROVED with no
 * fallback language and no fallback text (design-spec §5 production gate;
 * stop-condition "Unapproved content renders").
 *
 * DB-backed: real (immutability-guarded) PrismaService reads against seeded rows;
 * a fixed RequestContext supplies the clinic scope the resolver prefers.
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

const APPROVED_KEY = 'onboarding.welcome';
const DRAFT_KEY = 'onboarding.unapproved';
const PLACEHOLDER_KEY = 'onboarding.placeholder';

describe('Content resolver fails closed (e2e)', () => {
  let raw: PrismaClient;
  let prisma: PrismaService;
  let service: ContentService;

  const ORIGINAL_FLAG = process.env.ALLOW_PLACEHOLDER_CONTENT;

  // Minimal RequestContext stub returning our fixed clinic scope.
  const ctx = { get clinicId() { return clinicId; } } as unknown as RequestContext;

  beforeAll(async () => {
    ensureDatabaseUrl();
    raw = new PrismaClient();
    await raw.$connect();
    await seed(raw);
    prisma = new PrismaService();
    service = new ContentService(prisma, ctx);
  });

  afterAll(async () => {
    if (ORIGINAL_FLAG === undefined) delete process.env.ALLOW_PLACEHOLDER_CONTENT;
    else process.env.ALLOW_PLACEHOLDER_CONTENT = ORIGINAL_FLAG;
    await cleanup(raw);
    await (prisma as unknown as { $disconnect: () => Promise<void> }).$disconnect();
    await raw?.$disconnect();
  });

  it('resolves a real approved, non-placeholder translation', async () => {
    process.env.ALLOW_PLACEHOLDER_CONTENT = 'false';
    const result = await service.resolve(APPROVED_KEY, Language.EN);
    expect(result.text).toBe('Approved onboarding text (e2e).');
    expect(result.isPlaceholder).toBe(false);
  });

  it('fails closed on a draft-only (unapproved) key — CONTENT_NOT_APPROVED', async () => {
    process.env.ALLOW_PLACEHOLDER_CONTENT = 'false';
    await expect(service.resolve(DRAFT_KEY, Language.EN)).rejects.toMatchObject({
      code: ERROR_CODES.CONTENT_NOT_APPROVED,
    });
  });

  it('fails closed on a missing key with no fallback — CONTENT_NOT_APPROVED', async () => {
    process.env.ALLOW_PLACEHOLDER_CONTENT = 'false';
    await expect(service.resolve('does.not.exist', Language.EN)).rejects.toMatchObject({
      code: ERROR_CODES.CONTENT_NOT_APPROVED,
    });
  });

  it('fails closed on a placeholder translation when ALLOW_PLACEHOLDER_CONTENT=false', async () => {
    process.env.ALLOW_PLACEHOLDER_CONTENT = 'false';
    await expect(service.resolve(PLACEHOLDER_KEY, Language.EN)).rejects.toMatchObject({
      code: ERROR_CODES.CONTENT_NOT_APPROVED,
    });
  });

  it('does NOT fall back to another language for an approved key', async () => {
    process.env.ALLOW_PLACEHOLDER_CONTENT = 'false';
    // Only EN is approved for APPROVED_KEY; requesting RU must fail closed, never
    // silently serve the EN text.
    await expect(service.resolve(APPROVED_KEY, Language.RU)).rejects.toMatchObject({
      code: ERROR_CODES.CONTENT_NOT_APPROVED,
    });
  });

  it('the same placeholder is served ONLY when the flag is explicitly on (dev/demo)', async () => {
    process.env.ALLOW_PLACEHOLDER_CONTENT = 'true';
    const result = await service.resolve(PLACEHOLDER_KEY, Language.EN);
    expect(result.text).toBe('Placeholder onboarding text (e2e).');
    expect(result.isPlaceholder).toBe(true);
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
      name: 'Clinic Content (e2e)',
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

  // (1) Real approved, non-placeholder — the only key that should resolve closed.
  await db.contentItem.create({
    data: {
      clinicId,
      category: 'onboarding',
      contentKey: APPROVED_KEY,
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

  // (2) Draft-only — no approved translation exists.
  await db.contentItem.create({
    data: {
      clinicId,
      category: 'onboarding',
      contentKey: DRAFT_KEY,
      status: PrismaContentStatus.draft,
      translations: {
        create: {
          language: PrismaLanguage.EN,
          text: 'Draft text that must never render.',
          version: 1,
          status: PrismaContentStatus.draft,
          isPlaceholder: false,
        },
      },
    },
  });

  // (3) Placeholder — approved-status but flagged not clinically approved.
  await db.contentItem.create({
    data: {
      clinicId,
      category: 'onboarding',
      contentKey: PLACEHOLDER_KEY,
      status: PrismaContentStatus.approved,
      translations: {
        create: {
          language: PrismaLanguage.EN,
          text: 'Placeholder onboarding text (e2e).',
          version: 1,
          approvedBy: PLACEHOLDER_APPROVED_BY,
          approvedAt: new Date(),
          status: PrismaContentStatus.approved,
          isPlaceholder: true,
        },
      },
    },
  });
}

async function cleanup(db: PrismaClient): Promise<void> {
  await db.contentTranslation.deleteMany({
    where: { contentItem: { clinicId } },
  });
  await db.contentItem.deleteMany({ where: { clinicId } });
  await db.clinic.deleteMany({ where: { id: clinicId } });
}
