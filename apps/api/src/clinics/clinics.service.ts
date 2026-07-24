import { Injectable } from '@nestjs/common';
import { Clinic } from '@prisma/client';
import { ERROR_CODES } from '@hospital-ai/shared-types';
import { AppError } from '../common/errors';
import { RequestContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateClinicDto } from './dto/update-clinic.dto';

/** Staff-facing view of a clinic (config the dashboard needs; no secrets). */
export interface ClinicView {
  id: string;
  name: string;
  phone: string;
  emergencyNumber: string;
  workingHours: string;
  workingDays: string;
  timezone: string;
  onDutyContact: string | null;
  backupContact: string | null;
  headContact: string | null;
  notifyMinutes: number;
  ackMinutes: number;
  breachMinutes: number;
}

/**
 * The clinic fields whose changes are patient-facing (interpolated into safety
 * strings) and therefore AUDIT-LOGGED with actor + timestamp. Mapped to the
 * audit `field` label recorded in the append-only AuditLog.
 */
const AUDITED_FIELDS: Record<string, string> = {
  name: 'name',
  phone: 'phone',
  emergencyNumber: 'emergency_number',
};

/** Clinic reads + settings updates (staff · D7). */
@Injectable()
export class ClinicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
  ) {}

  /**
   * Fetch a clinic by id. The caller only ever passes the clinic id from its own
   * verified token, so this reads the tenant itself (Clinic is the tenant root and
   * is not clinic-scoped by the tenancy extension).
   */
  async get(clinicId: string): Promise<ClinicView> {
    const clinic = await this.prisma.clinic.findUnique({ where: { id: clinicId } });
    if (!clinic) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Clinic not found.', { clinicId });
    }
    return this.toView(clinic);
  }

  /**
   * Update the authenticated clinic's settings (D7). Only the provided fields are
   * changed. Changes to `name` / `phone` / `emergencyNumber` are appended to the
   * immutable AuditLog (actor + timestamp + old→new) BEFORE the update commits, so
   * the audit trail can never be lost even if the update later fails.
   */
  async update(clinicId: string, dto: UpdateClinicDto): Promise<ClinicView> {
    const clinic = await this.prisma.clinic.findUnique({ where: { id: clinicId } });
    if (!clinic) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Clinic not found.', { clinicId });
    }

    const data = pickDefined(dto);
    if (Object.keys(data).length === 0) {
      return this.toView(clinic);
    }

    // Audit the sensitive, patient-facing changes (only when the value actually changes).
    const current = clinic as unknown as Record<string, unknown>;
    for (const [key, label] of Object.entries(AUDITED_FIELDS)) {
      if (key in data && String(data[key]) !== String(current[key] ?? '')) {
        await this.prisma.auditLog.create({
          data: {
            clinicId,
            actorId: this.ctx.staffId ?? null,
            actorRole: this.ctx.role ?? null,
            entity: 'clinic',
            entityId: clinicId,
            field: label,
            oldValue: current[key] == null ? null : String(current[key]),
            newValue: data[key] == null ? null : String(data[key]),
          },
        });
      }
    }

    const updated = await this.prisma.clinic.update({ where: { id: clinicId }, data });
    return this.toView(updated);
  }

  private toView(clinic: Clinic): ClinicView {
    return {
      id: clinic.id,
      name: clinic.name,
      phone: clinic.phone,
      emergencyNumber: clinic.emergencyNumber,
      workingHours: clinic.workingHours,
      workingDays: clinic.workingDays,
      timezone: clinic.timezone,
      onDutyContact: clinic.onDutyContact,
      backupContact: clinic.backupContact,
      headContact: clinic.headContact,
      notifyMinutes: clinic.notifyMinutes,
      ackMinutes: clinic.ackMinutes,
      breachMinutes: clinic.breachMinutes,
    };
  }
}

/** Keep only the keys explicitly provided (undefined dropped) — a partial update. */
function pickDefined(dto: UpdateClinicDto): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(dto)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}
