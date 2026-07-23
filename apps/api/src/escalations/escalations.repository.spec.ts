// A dummy DATABASE_URL is enough: the immutability guard throws BEFORE any
// connection is attempted, so no live Postgres is required for this test.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://user:pass@localhost:5432/db';

import { ERROR_CODES, EscalationStatus } from '@hospital-ai/shared-types';
import { AppError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { assertForwardTransition } from './escalations.repository';

describe('assertForwardTransition (forward-only ladder)', () => {
  it('permits a strictly forward move', () => {
    expect(() =>
      assertForwardTransition(EscalationStatus.new, EscalationStatus.acknowledged),
    ).not.toThrow();
    expect(() =>
      assertForwardTransition(EscalationStatus.acknowledged, EscalationStatus.breached),
    ).not.toThrow();
  });

  it('rejects a backward transition', () => {
    try {
      assertForwardTransition(EscalationStatus.contacted, EscalationStatus.new);
      throw new Error('expected a backward transition to be rejected');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe(ERROR_CODES.INVALID_STATUS_TRANSITION);
    }
  });

  it('rejects a no-op (same status) transition', () => {
    expect(() =>
      assertForwardTransition(EscalationStatus.acknowledged, EscalationStatus.acknowledged),
    ).toThrow(AppError);
  });
});

describe('Escalation append-only guard', () => {
  it('throws on a direct prisma.escalation.update (append-only, sealed ORM surface)', async () => {
    const prisma = new PrismaService();
    await expect(
      prisma.escalation.update({
        where: { id: 'anything' },
        data: { status: EscalationStatus.acknowledged },
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.APPEND_ONLY_VIOLATION });
  });
});
