import { ContentStatus } from '@prisma/client';
import { ERROR_CODES, Language } from '@hospital-ai/shared-types';
import { AppError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { EnvConfig } from './env.validation';
import { ProductionGateService } from './production-gate.service';

/** Minimal prisma stub — only `contentItem.findMany` is exercised by the gate. */
function stubPrisma(items: unknown[]): PrismaService {
  return {
    contentItem: {
      findMany: jest.fn().mockResolvedValue(items),
    },
  } as unknown as PrismaService;
}

function envWith(overrides: Partial<EnvConfig>): EnvConfig {
  const env = new EnvConfig();
  env.NODE_ENV = 'test';
  env.DATABASE_URL = 'postgresql://localhost:5432/test';
  env.ALLOW_PLACEHOLDER_CONTENT = false;
  env.PATIENT_ENROLMENT_ENABLED = false;
  return Object.assign(env, overrides);
}

const CLINIC_ID = '018f-clinic';

describe('ProductionGateService', () => {
  describe('assertEnrolmentAllowed', () => {
    it('throws CLINICAL_CONTENT_NOT_APPROVED when enrolment is disabled (without touching the DB)', async () => {
      const prisma = stubPrisma([]);
      const gate = new ProductionGateService(
        envWith({ PATIENT_ENROLMENT_ENABLED: false }),
        prisma,
      );

      await expect(gate.assertEnrolmentAllowed(CLINIC_ID, Language.EN)).rejects.toMatchObject({
        code: ERROR_CODES.CLINICAL_CONTENT_NOT_APPROVED,
      });
      await expect(
        gate.assertEnrolmentAllowed(CLINIC_ID, Language.EN),
      ).rejects.toBeInstanceOf(AppError);
      // Fails fast before any content query.
      expect((prisma.contentItem.findMany as jest.Mock)).not.toHaveBeenCalled();
    });

    it('throws when enabled but a required content item has no approved, non-placeholder translation', async () => {
      const prisma = stubPrisma([
        {
          contentKey: 'onboarding.welcome',
          translations: [{ status: ContentStatus.approved, isPlaceholder: false }],
        },
        {
          contentKey: 'safety.call_clinic',
          // placeholder => not a real sign-off => blocks enrolment.
          translations: [{ status: ContentStatus.approved, isPlaceholder: true }],
        },
      ]);
      const gate = new ProductionGateService(
        envWith({ PATIENT_ENROLMENT_ENABLED: true }),
        prisma,
      );

      await expect(
        gate.assertEnrolmentAllowed(CLINIC_ID, Language.EN),
      ).rejects.toMatchObject({
        code: ERROR_CODES.CLINICAL_CONTENT_NOT_APPROVED,
        details: { unsignedKeys: ['safety.call_clinic'] },
      });
    });

    it('resolves when enabled and all required content is really signed off', async () => {
      const prisma = stubPrisma([
        {
          contentKey: 'onboarding.welcome',
          translations: [{ status: ContentStatus.approved, isPlaceholder: false }],
        },
      ]);
      const gate = new ProductionGateService(
        envWith({ PATIENT_ENROLMENT_ENABLED: true }),
        prisma,
      );

      await expect(
        gate.assertEnrolmentAllowed(CLINIC_ID, Language.EN),
      ).resolves.toBeUndefined();
    });
  });

  describe('isPlaceholderActive', () => {
    it('reflects ALLOW_PLACEHOLDER_CONTENT', () => {
      const prisma = stubPrisma([]);
      expect(
        new ProductionGateService(
          envWith({ ALLOW_PLACEHOLDER_CONTENT: true }),
          prisma,
        ).isPlaceholderActive(),
      ).toBe(true);
      expect(
        new ProductionGateService(
          envWith({ ALLOW_PLACEHOLDER_CONTENT: false }),
          prisma,
        ).isPlaceholderActive(),
      ).toBe(false);
    });
  });
});
