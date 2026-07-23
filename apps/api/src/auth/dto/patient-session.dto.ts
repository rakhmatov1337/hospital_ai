import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

/**
 * Patient session bootstrap: single-use 6-char enrolment code + phone.
 * No password — the code is issued at enrolment (14-day expiry).
 */
export class PatientSessionDto {
  @ApiProperty({ example: 'H7K9QP', description: 'Single-use 6-character enrolment code.' })
  @IsString()
  @Length(6, 6)
  code!: string;

  @ApiProperty({ example: '+998901234567' })
  @IsString()
  @IsNotEmpty()
  phone!: string;
}
