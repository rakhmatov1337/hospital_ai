import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ERROR_CODES,
  EscalationStatus,
  ESCALATION_STATUS_ORDER,
  Tier,
} from '@hospital-ai/shared-types';
import { AppError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateEscalationInput {
  checkinId: string;
  patientId: string;
  tier: Tier;
  /** Optional initial status; defaults to `new`. Only forward advance thereafter. */
  status?: EscalationStatus;
  outcomeCode?: string | null;
  clinicalNote?: string | null;
}

export interface AppendNotificationInput {
  escalationId: string;
  attemptNumber: number;
  channel: string;
  recipientRole: string;
  sentAt?: Date;
  delivered?: boolean;
}

/**
 * Append-only escalation repository. The contract is deliberately narrow:
 *
 *  - `create()`            — appends a new Escalation row.
 *  - `appendNotification()`— appends a notification attempt (incl. failed ones).
 *  - `advanceStatus()`     — the ONLY sanctioned mutation of an Escalation, and
 *                            it is forward-only (new→acknowledged→contacted→breached).
 *
 * There is intentionally NO update/delete of prior rows. The immutability guard
 * seals the ORM mutation surface (`prisma.escalation.update/delete` throw), which
 * makes an escalation impossible to edit, delete, or hide anywhere in the code.
 * `advanceStatus` therefore performs its single, validated forward move through a
 * controlled raw statement — the one deliberate exception, gated by
 * `assertForwardTransition`, so a backward or illegal move is rejected before any
 * write happens (design spec §2 "Escalation edited/deleted/hidden").
 */
@Injectable()
export class EscalationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateEscalationInput) {
    return this.prisma.escalation.create({
      data: {
        checkinId: input.checkinId,
        patientId: input.patientId,
        tier: input.tier,
        status: input.status ?? EscalationStatus.new,
        outcomeCode: input.outcomeCode ?? null,
        clinicalNote: input.clinicalNote ?? null,
      },
    });
  }

  async appendNotification(input: AppendNotificationInput) {
    return this.prisma.escalationNotification.create({
      data: {
        escalationId: input.escalationId,
        attemptNumber: input.attemptNumber,
        channel: input.channel,
        recipientRole: input.recipientRole,
        sentAt: input.sentAt ?? new Date(),
        delivered: input.delivered ?? false,
      },
    });
  }

  /**
   * Advance an escalation strictly forward along the status ladder. A backward,
   * same, or unknown transition throws INVALID_STATUS_TRANSITION and nothing is
   * written. The forward move is applied via a controlled raw UPDATE because the
   * ORM `escalation.update` path is intentionally sealed by the immutability
   * guard; this is the single sanctioned status mutation.
   */
  async advanceStatus(escalationId: string, target: EscalationStatus) {
    const current = await this.prisma.escalation.findUnique({
      where: { id: escalationId },
      select: { id: true, status: true },
    });
    if (!current) {
      throw new AppError(
        ERROR_CODES.NOT_FOUND,
        `Escalation ${escalationId} not found.`,
        { escalationId },
      );
    }

    assertForwardTransition(current.status as EscalationStatus, target);

    await this.prisma.$executeRaw(
      Prisma.sql`UPDATE "escalation" SET "status" = ${target}::"EscalationStatus" WHERE "id" = ${escalationId}`,
    );

    return this.prisma.escalation.findUniqueOrThrow({ where: { id: escalationId } });
  }
}

/**
 * Pure forward-only validator over the pinned status ladder. Exported for direct
 * unit testing. Throws AppError(INVALID_STATUS_TRANSITION) unless `target` is
 * strictly later than `current` in ESCALATION_STATUS_ORDER.
 */
export function assertForwardTransition(
  current: EscalationStatus,
  target: EscalationStatus,
): void {
  const from = ESCALATION_STATUS_ORDER.indexOf(current);
  const to = ESCALATION_STATUS_ORDER.indexOf(target);

  if (from === -1 || to === -1) {
    throw new AppError(
      ERROR_CODES.INVALID_STATUS_TRANSITION,
      `Unknown escalation status transition ${String(current)} -> ${String(target)}.`,
      { from: current, to: target },
    );
  }
  if (to <= from) {
    throw new AppError(
      ERROR_CODES.INVALID_STATUS_TRANSITION,
      `Escalation status is forward-only; ${current} -> ${target} is not allowed.`,
      { from: current, to: target },
    );
  }
}
