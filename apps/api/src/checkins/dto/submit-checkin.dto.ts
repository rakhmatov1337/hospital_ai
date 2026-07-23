import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDefined,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * A single structured check-in answer. The `value` is intentionally a loose
 * union (categorical code, code set, or a numeric scale point) — its SEMANTIC
 * validity (a known code / a numeric in range, never free text) is enforced
 * server-side in CheckinsService against CHECKIN_QUESTIONS, the single source of
 * truth. class-validator only guarantees the shape here; it is `@IsDefined()` so
 * the ValidationPipe whitelist keeps it rather than stripping it.
 */
export class CheckinAnswerDto {
  @ApiProperty({ description: 'Question ref from CHECKIN_QUESTIONS, e.g. "q4_wound".' })
  @IsString()
  @IsNotEmpty()
  ref!: string;

  @ApiProperty({
    description:
      'Categorical code (single), array of codes (multi), or a numeric scale point. ' +
      'Free text is rejected server-side.',
  })
  @IsDefined()
  value!: string | number | string[];
}

/**
 * `POST /v1/checkins` body. The answer set is validated against the seven
 * CHECKIN_QUESTIONS (categorical/numeric ONLY — free text is rejected). The
 * idempotency key travels in the `Idempotency-Key` header, not here.
 */
export class SubmitCheckinDto {
  @ApiPropertyOptional({
    description: 'Question-set version the client rendered. Defaults to placeholder-v1.',
  })
  @IsOptional()
  @IsString()
  questionSetVersion?: string;

  @ApiProperty({ type: [CheckinAnswerDto], description: 'The check-in answers.' })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CheckinAnswerDto)
  answers!: CheckinAnswerDto[];
}
