import { Injectable } from '@nestjs/common';
import { Patient } from '@prisma/client';
import { ERROR_CODES } from '@hospital-ai/shared-types';
import { AppError } from '../common/errors';
import { RequestContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** Compact patient row for the staff list view. */
export interface PatientSummary {
  id: string;
  patientRef: string;
  name: string;
  status: string;
  language: string;
  procedureType: string;
  dischargeDate: Date;
  planId: string | null;
  createdAt: Date;
}

/** Full staff-facing patient detail. */
export interface PatientDetail extends PatientSummary {
  phone: string;
  ageBand: string;
  enrolmentCode: string;
  codeExpiresAt: Date | null;
  consentVersion: string | null;
  consentedAt: Date | null;
}

/** One cursor-paginated page of patients. */
export interface PatientPage {
  items: PatientSummary[];
  nextCursor: string | null;
}

/**
 * Clinic-scoped patient reads (staff).
 *
 * The list uses the tenancy-scoped client (`prisma.forClinic`) so the
 * `where: { clinic_id }` filter is injected at the repository layer — a forgotten
 * controller filter cannot leak another clinic's patients. The by-id detail path
 * (a `findUnique`, deliberately excluded from blanket auto-scoping) is validated
 * explicitly here: a patient belonging to another clinic yields
 * `CROSS_CLINIC_FORBIDDEN`, never that clinic's data.
 */
@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
  ) {}

  async list(cursor?: string, limit?: number): Promise<PatientPage> {
    const clinicId = this.ctx.requireClinicId();
    const take = Math.min(Math.max(limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);

    // Tenancy-scoped client: injects where:{ clinicId } for Patient.findMany.
    const scoped = this.prisma.forClinic(clinicId) as unknown as PrismaService;

    const rows = await scoped.patient.findMany({
      take: take + 1,
      orderBy: { id: 'asc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    return {
      items: page.map((p) => this.toSummary(p)),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async get(id: string): Promise<PatientDetail> {
    const clinicId = this.ctx.requireClinicId();

    // Unique-by-id lookup is validated at the service layer (see tenancy.extension).
    const patient = await this.prisma.patient.findUnique({ where: { id } });
    if (!patient) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Patient not found.', { id });
    }
    if (patient.clinicId !== clinicId) {
      throw new AppError(
        ERROR_CODES.CROSS_CLINIC_FORBIDDEN,
        'This patient belongs to another clinic.',
      );
    }

    return this.toDetail(patient);
  }

  private toSummary(patient: Patient): PatientSummary {
    return {
      id: patient.id,
      patientRef: patient.patientRef,
      name: patient.name,
      status: patient.status,
      language: patient.language,
      procedureType: patient.procedureType,
      dischargeDate: patient.dischargeDate,
      planId: patient.planId,
      createdAt: patient.createdAt,
    };
  }

  private toDetail(patient: Patient): PatientDetail {
    return {
      ...this.toSummary(patient),
      phone: patient.phone,
      ageBand: patient.ageBand,
      enrolmentCode: patient.enrolmentCode,
      codeExpiresAt: patient.codeExpiresAt,
      consentVersion: patient.consentVersion,
      consentedAt: patient.consentedAt,
    };
  }
}
