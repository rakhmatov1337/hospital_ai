import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The closed set of contact outcomes (SP2 spec §7). An escalation is only ever
 * closed WITH an outcome — there is no delete and no dismiss-without-outcome, so
 * every closed escalation carries one of these codes as its liability record.
 */
export const OUTCOME_CODES = [
  'advised_at_home',
  'attend_clinic',
  'referred_emergency',
  'no_action',
  'unable_to_reach',
] as const;

export type OutcomeCode = (typeof OUTCOME_CODES)[number];

/**
 * Body for `POST /v1/escalations/:id/contact`. `outcomeCode` is REQUIRED — the
 * only way to close an escalation is to record how the patient contact resolved.
 * `clinicalNote` is optional and staff-only (never surfaced to a patient client).
 */
export class ContactEscalationDto {
  @ApiProperty({
    description: 'How the patient contact resolved (required to close the escalation).',
    enum: OUTCOME_CODES,
  })
  @IsString()
  @IsIn(OUTCOME_CODES as unknown as string[])
  outcomeCode!: OutcomeCode;

  @ApiPropertyOptional({
    description: 'Optional staff-only clinical note (never shown to the patient).',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  clinicalNote?: string;
}
