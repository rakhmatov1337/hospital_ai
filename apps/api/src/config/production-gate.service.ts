import { Injectable } from '@nestjs/common';
import { ContentStatus, Language as PrismaLanguage } from '@prisma/client';
import { ERROR_CODES, Language } from '@hospital-ai/shared-types';
import { AppError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { EnvConfig } from './env.validation';

/**
 * The production gate (spec §5).
 *
 * Binds the two env flags to the one rule that keeps unapproved clinical text
 * away from patients: a patient is never enrolled unless enrolment is enabled
 * AND every required clinical content string in that patient's language carries
 * a real clinician sign-off (an `approved`, non-placeholder translation).
 *
 * A placeholder row (`is_placeholder = true`, approved_by =
 * "PLACEHOLDER — NOT CLINICALLY APPROVED") is NOT a real sign-off and therefore
 * fails the gate regardless of `ALLOW_PLACEHOLDER_CONTENT`.
 */
@Injectable()
export class ProductionGateService {
  constructor(
    private readonly env: EnvConfig,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Whether placeholder (not-clinically-approved) content is currently permitted
   * to be served. `true` in dev/staging/demo; the dashboard renders a persistent
   * placeholder banner while this is active (SP4 hook).
   */
  isPlaceholderActive(): boolean {
    return this.env.ALLOW_PLACEHOLDER_CONTENT;
  }

  /**
   * Refuse patient enrolment unless it is enabled and all required clinical
   * content for `language` is really signed off. Throws
   * `AppError(CLINICAL_CONTENT_NOT_APPROVED)` otherwise — never a silent pass.
   */
  async assertEnrolmentAllowed(clinicId: string, language: Language): Promise<void> {
    if (!this.env.PATIENT_ENROLMENT_ENABLED) {
      throw new AppError(
        ERROR_CODES.CLINICAL_CONTENT_NOT_APPROVED,
        'Patient enrolment is disabled: clinical content is not clinically approved.',
        { reason: 'PATIENT_ENROLMENT_DISABLED' },
      );
    }

    // Required content = every content item visible to the clinic (clinic-owned
    // or global/shared). Each must have an approved, non-placeholder translation
    // in the patient's language.
    const items = await this.prisma.contentItem.findMany({
      where: { OR: [{ clinicId }, { clinicId: null }] },
      select: {
        contentKey: true,
        translations: {
          where: { language: language as unknown as PrismaLanguage },
          select: { status: true, isPlaceholder: true },
        },
      },
    });

    const unsignedKeys = items
      .filter(
        (item) =>
          !item.translations.some(
            (t) => t.status === ContentStatus.approved && !t.isPlaceholder,
          ),
      )
      .map((item) => item.contentKey);

    if (unsignedKeys.length > 0) {
      throw new AppError(
        ERROR_CODES.CLINICAL_CONTENT_NOT_APPROVED,
        'Enrolment refused: required clinical content lacks a clinician sign-off.',
        { reason: 'CONTENT_UNSIGNED', language, unsignedKeys },
      );
    }
  }
}
