import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Patient } from '@prisma/client';
import { ERROR_CODES, PatientStatus } from '@hospital-ai/shared-types';
import { AppError } from '../common/errors';
import { RequestContext } from '../common/request-context';
import { ProductionGateService } from '../config/production-gate.service';
import { TaskGenerationService } from '../plans/task-generation.service';
import { PrismaService } from '../prisma/prisma.service';
import { EnrolPatientDto } from './dto/enrol-patient.dto';

/**
 * Enrolment-code alphabet: uppercase letters + digits with the visually
 * ambiguous characters O/0 and I/1 removed (spec §4 — codes are read aloud and
 * typed by patients). 32 symbols → 32^6 ≈ 1.07e9 codes.
 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const REF_LENGTH = 8;
const CODE_TTL_DAYS = 14;
const MAX_CODE_ATTEMPTS = 12;

/** Result of a successful enrolment (staff-facing; the code is handed to the patient). */
export interface EnrolmentResult {
  patient: EnrolledPatientView;
  enrolmentCode: string;
  codeExpiresAt: Date;
  tasksGenerated: number;
}

export interface EnrolledPatientView {
  id: string;
  patientRef: string;
  name: string;
  status: string;
  language: string;
  procedureType: string;
  dischargeDate: Date;
  planId: string | null;
}

function randomFromAlphabet(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * Patient enrolment (design spec §4/§5/§6).
 *
 * Order is load-bearing: the production gate runs FIRST — no Patient row is ever
 * created while enrolment is disabled or required clinical content lacks a real
 * clinician sign-off (fail-closed, `CLINICAL_CONTENT_NOT_APPROVED`). Only then do
 * we create the Patient (status `enrolled`, single-use 6-char code, 14-day
 * expiry) + an immutable Consent row, and materialise the full 30-day task set.
 *
 * The clinic is taken from the authenticated staff token (RequestContext), never
 * from the request body — tenancy is server-assigned.
 */
@Injectable()
export class EnrolmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly gate: ProductionGateService,
    private readonly taskGeneration: TaskGenerationService,
  ) {}

  async enrol(dto: EnrolPatientDto): Promise<EnrolmentResult> {
    const clinicId = this.ctx.requireClinicId();

    // 1. Production gate FIRST — refuses before any row is written.
    await this.gate.assertEnrolmentAllowed(clinicId, dto.language);

    // 2. Resolve the clinic's recovery-plan template for this procedure.
    const plan = await this.prisma.recoveryPlan.findFirst({
      where: { clinicId, procedureType: dto.procedureType },
      orderBy: { createdAt: 'desc' },
    });
    if (!plan) {
      throw new AppError(
        ERROR_CODES.NOT_FOUND,
        'No recovery-plan template exists for this procedure at this clinic.',
        { procedureType: dto.procedureType },
      );
    }

    // 3. Allocate a unique enrolment code (retry on the rare collision).
    const enrolmentCode = await this.allocateEnrolmentCode();
    const patientRef = dto.patientRef?.trim() || `PT-${randomFromAlphabet(REF_LENGTH)}`;
    const now = new Date();
    const codeExpiresAt = new Date(now.getTime() + CODE_TTL_DAYS * 24 * 60 * 60 * 1000);
    const dischargeDate = new Date(dto.dischargeDate);

    // 4. Create the Patient + immutable Consent row in one transaction.
    const patient = await this.prisma.$transaction(async (tx) => {
      const created = await tx.patient.create({
        data: {
          clinicId,
          patientRef,
          name: dto.name,
          phone: dto.phone.trim(),
          ageBand: dto.ageBand,
          procedureType: dto.procedureType,
          dischargeDate,
          language: dto.language,
          planId: plan.id,
          status: PatientStatus.enrolled,
          enrolmentCode,
          codeExpiresAt,
          consentVersion: dto.consentVersion,
          consentedAt: now,
        },
      });

      await tx.consent.create({
        data: {
          patientId: created.id,
          version: dto.consentVersion,
          acceptedAt: now,
          textSnapshot: dto.consentTextSnapshot,
        },
      });

      return created;
    });

    // 5. Materialise the full 30-day task set from the plan template.
    const tasksGenerated = await this.taskGeneration.generateForPatient(patient.id);

    return {
      patient: this.toView(patient),
      enrolmentCode,
      codeExpiresAt,
      tasksGenerated,
    };
  }

  private async allocateEnrolmentCode(): Promise<string> {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const code = randomFromAlphabet(CODE_LENGTH);
      const clash = await this.prisma.patient.findUnique({
        where: { enrolmentCode: code },
        select: { id: true },
      });
      if (!clash) return code;
    }
    throw new AppError(
      ERROR_CODES.INTERNAL_ERROR,
      'Could not allocate a unique enrolment code.',
    );
  }

  private toView(patient: Patient): EnrolledPatientView {
    return {
      id: patient.id,
      patientRef: patient.patientRef,
      name: patient.name,
      status: patient.status,
      language: patient.language,
      procedureType: patient.procedureType,
      dischargeDate: patient.dischargeDate,
      planId: patient.planId,
    };
  }
}
