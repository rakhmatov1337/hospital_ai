import { Injectable } from '@nestjs/common';
import { Clinic } from '@prisma/client';
import { ERROR_CODES } from '@hospital-ai/shared-types';
import { AppError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';

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

/** Clinic reads (staff GET /v1/clinics/me). */
@Injectable()
export class ClinicsService {
  constructor(private readonly prisma: PrismaService) {}

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
