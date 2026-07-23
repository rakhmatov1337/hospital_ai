import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Language } from '@hospital-ai/shared-types';

/**
 * Staff-initiated patient enrolment.
 *
 * NOTE: `clinic_id` is deliberately NOT a field here — a patient's clinic is
 * taken from the authenticated staff token (RequestContext), never from the
 * client (stop-condition: tenancy is server-assigned). Likewise there are no
 * patient-visible display strings: `consentTextSnapshot` is the verbatim consent
 * text the clinic presented, captured for the audit trail, not authored here.
 */
export class EnrolPatientDto {
  @ApiProperty({ example: 'Patient A', description: 'Patient full name (clinician record).' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @ApiProperty({ example: '+998901234567' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  phone!: string;

  @ApiProperty({ example: '30-39', description: 'Coarse age band (never a birth date).' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  ageBand!: string;

  @ApiProperty({
    example: 'laparoscopic_appendectomy',
    description: 'Procedure type; must match a recovery-plan template for the clinic.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  procedureType!: string;

  @ApiProperty({ example: '2026-07-20', description: 'Discharge date (recovery day 0), ISO-8601.' })
  @IsDateString()
  dischargeDate!: string;

  @ApiProperty({ enum: Language, example: Language.UZ })
  @IsEnum(Language)
  language!: Language;

  @ApiProperty({ example: 'v1.0', description: 'Version identifier of the consent presented.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  consentVersion!: string;

  @ApiProperty({
    description: 'Verbatim consent text the patient accepted (immutable snapshot for the record).',
  })
  @IsString()
  @IsNotEmpty()
  consentTextSnapshot!: string;

  @ApiProperty({
    required: false,
    description: 'Anonymised patient reference; generated if omitted. The only id used in telemetry.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  patientRef?: string;
}
