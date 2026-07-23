import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PrismaClient,
  Language as PrismaLanguage,
  Tier as PrismaTier,
  EscalationStatus as PrismaEscalationStatus,
} from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import { ERROR_CODES, EscalationStatus } from '@hospital-ai/shared-types';

import { PrismaService } from '../src/prisma/prisma.service';
import {
  EscalationsRepository,
} from '../src/escalations/escalations.repository';

/**
 * MANDATORY negative test (4): an escalation can never be edited, deleted, or
 * hidden — enforced two ways, both proven here:
 *
 *   (a) the EscalationsRepository exposes NO update/delete surface at all
 *       (create / appendNotification / advanceStatus only), and
 *   (b) the sealed ORM path throws: prisma.escalation.{update,updateMany,delete,
 *       deleteMany,upsert} all raise APPEND_ONLY_VIOLATION, and the row on disk
 *       is left byte-for-byte unchanged after every attempt.
 *
 * EscalationNotification (append-only, incl. failed attempts) is checked the same
 * way. This is the structural realisation of design-spec §2
 * "Escalation edited/deleted/hidden".
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
const checkinId = uuidv7();
const escalationId = uuidv7();
const notificationId = uuidv7();

describe('Escalation immutability (e2e)', () => {
  let raw: PrismaClient;
  let prisma: PrismaService;

  beforeAll(async () => {
    ensureDatabaseUrl();
    raw = new PrismaClient();
    await raw.$connect();
    await seed(raw);
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await cleanup(raw);
    await (prisma as unknown as { $disconnect: () => Promise<void> }).$disconnect();
    await raw?.$disconnect();
  });

  it('(a) the repository exposes no update/delete method — only append + forward-advance', () => {
    const repo = new EscalationsRepository(prisma);
    const surface = new Set<string>();
    for (
      let obj: object | null = repo;
      obj && obj !== Object.prototype;
      obj = Object.getPrototypeOf(obj)
    ) {
      for (const name of Object.getOwnPropertyNames(obj)) surface.add(name);
    }

    // No mutation-of-prior-rows verbs anywhere on the repository contract.
    for (const forbidden of ['update', 'updateMany', 'delete', 'deleteMany', 'upsert']) {
      expect(surface.has(forbidden)).toBe(false);
    }
    // The sanctioned append-only contract IS present.
    expect(typeof repo.create).toBe('function');
    expect(typeof repo.appendNotification).toBe('function');
    expect(typeof repo.advanceStatus).toBe('function');
  });

  it('(b) prisma.escalation.update is sealed (APPEND_ONLY_VIOLATION)', async () => {
    await expect(
      prisma.escalation.update({
        where: { id: escalationId },
        data: { status: EscalationStatus.acknowledged },
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.APPEND_ONLY_VIOLATION });
  });

  it('(b) prisma.escalation.delete / deleteMany / updateMany / upsert are all sealed', async () => {
    await expect(
      prisma.escalation.delete({ where: { id: escalationId } }),
    ).rejects.toMatchObject({ code: ERROR_CODES.APPEND_ONLY_VIOLATION });

    await expect(
      prisma.escalation.deleteMany({ where: { id: escalationId } }),
    ).rejects.toMatchObject({ code: ERROR_CODES.APPEND_ONLY_VIOLATION });

    await expect(
      prisma.escalation.updateMany({
        where: { id: escalationId },
        data: { outcomeCode: 'tampered' },
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.APPEND_ONLY_VIOLATION });

    await expect(
      prisma.escalation.upsert({
        where: { id: escalationId },
        update: { outcomeCode: 'tampered' },
        create: {
          id: escalationId,
          checkinId,
          patientId,
          tier: PrismaTier.urgent,
        },
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.APPEND_ONLY_VIOLATION });
  });

  it('(b) EscalationNotification is likewise sealed against update/delete', async () => {
    await expect(
      prisma.escalationNotification.update({
        where: { id: notificationId },
        data: { delivered: true },
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.APPEND_ONLY_VIOLATION });

    await expect(
      prisma.escalationNotification.delete({ where: { id: notificationId } }),
    ).rejects.toMatchObject({ code: ERROR_CODES.APPEND_ONLY_VIOLATION });
  });

  it('the escalation row on disk is unchanged after every tamper attempt', async () => {
    const row = await raw.escalation.findUniqueOrThrow({ where: { id: escalationId } });
    expect(row.status).toBe(PrismaEscalationStatus.new);
    expect(row.outcomeCode).toBeNull();

    const notif = await raw.escalationNotification.findUniqueOrThrow({
      where: { id: notificationId },
    });
    expect(notif.delivered).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Seed / cleanup (raw client — bypasses immutability so the fixture can exist).
// ---------------------------------------------------------------------------

async function seed(db: PrismaClient): Promise<void> {
  await cleanup(db);

  await db.clinic.create({
    data: {
      id: clinicId,
      name: 'Clinic Escal (e2e)',
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
      patientRef: `PT-ESC-${patientId.slice(0, 8)}`,
      name: 'Escal Patient',
      phone: '+998900000020',
      ageBand: '40-49',
      procedureType: 'e2e_procedure',
      dischargeDate: new Date('2026-07-18'),
      language: PrismaLanguage.EN,
      enrolmentCode: `E${uuidv7().replace(/-/g, '').slice(0, 5).toUpperCase()}`,
    },
  });

  await db.checkIn.create({
    data: {
      id: checkinId,
      patientId,
      submittedAt: new Date(),
      recoveryDay: 3,
      questionSetVersion: 'v1',
      ruleVersion: 'v1',
      tierAssigned: PrismaTier.urgent,
      withinClinicHours: true,
    },
  });

  await db.escalation.create({
    data: {
      id: escalationId,
      checkinId,
      patientId,
      tier: PrismaTier.urgent,
      status: PrismaEscalationStatus.new,
    },
  });

  await db.escalationNotification.create({
    data: {
      id: notificationId,
      escalationId,
      attemptNumber: 1,
      channel: 'sms',
      recipientRole: 'on_duty',
      sentAt: new Date(),
      delivered: false,
    },
  });
}

async function cleanup(db: PrismaClient): Promise<void> {
  await db.escalationNotification.deleteMany({ where: { escalation: { patientId } } });
  await db.escalation.deleteMany({ where: { patientId } });
  await db.checkInAnswer.deleteMany({ where: { checkIn: { patientId } } });
  await db.checkIn.deleteMany({ where: { patientId } });
  await db.patient.deleteMany({ where: { clinicId } });
  await db.clinic.deleteMany({ where: { id: clinicId } });
}
