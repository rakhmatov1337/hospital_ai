import { Injectable } from '@nestjs/common';
import { AppError } from '../common/errors';
import { ERROR_CODES } from '@hospital-ai/shared-types';
import { PrismaService } from '../prisma/prisma.service';

/**
 * A single categorical telemetry value. Free clinical text is structurally
 * impossible: only primitives are accepted, and nested objects/arrays are
 * rejected at runtime — so a payload cannot smuggle a free-text blob into
 * analytics (design spec §2, "Analytics carry clinical free text").
 */
export type CategoricalValue = string | number | boolean | null;
export type CategoricalPayload = Record<string, CategoricalValue>;

/** Envelope fields required to place an Event in a clinic/day/schema context. */
export interface TelemetryMeta {
  /** Owning clinic (Event is clinic-scoped and append-only). */
  clinicId: string;
  /** Anonymised patient reference ONLY — never the internal patient_id. */
  patientRef?: string | null;
  recoveryDay?: number | null;
  /** UTC offset for the local moment, e.g. '+05:00'. Never a bare local time. */
  localOffset?: string;
  /** Defaults to now (UTC). */
  occurredAt?: Date;
  /** Analytics schema version for this event shape. */
  schemaVersion?: number;
}

/**
 * Append-only Event writer. `emit` only ever CREATEs (the immutability guard
 * blocks update/delete of Event at the ORM layer), and the payload is
 * categorical-only. The 16-event catalogue and its emitters land in SP2 — here
 * we provide the append-only writer contract other modules call.
 */
@Injectable()
export class TelemetryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Append one analytics Event. Rejects non-categorical payloads so clinical
   * free text can never enter analytics.
   */
  async emit(
    eventName: string,
    payload: CategoricalPayload,
    meta: TelemetryMeta,
  ): Promise<void> {
    assertCategorical(payload);

    await this.prisma.event.create({
      data: {
        clinicId: meta.clinicId,
        patientRef: meta.patientRef ?? null,
        eventName,
        occurredAt: meta.occurredAt ?? new Date(),
        localOffset: meta.localOffset ?? '+00:00',
        recoveryDay: meta.recoveryDay ?? null,
        schemaVersion: meta.schemaVersion ?? 1,
        payload,
      },
    });
  }
}

/**
 * Structural guard: every payload value must be a primitive (string, number,
 * boolean) or null. Objects and arrays are rejected — they are the shape free
 * text and clinical detail would arrive in.
 */
export function assertCategorical(payload: CategoricalPayload): void {
  for (const [key, value] of Object.entries(payload)) {
    if (value === null) continue;
    const t = typeof value;
    if (t !== 'string' && t !== 'number' && t !== 'boolean') {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        `Telemetry payload field '${key}' is not categorical; only string|number|boolean|null are permitted.`,
        { field: key },
      );
    }
  }
}
