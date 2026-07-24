import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Body for `POST /v1/me/survey` (P17, day-30 satisfaction). Four 1–5 scale items
 * plus an OPTIONAL free-text comment.
 *
 * `freeText` is WRITE-ONLY: it is persisted to `SurveyResponse.free_text` and is
 * never returned by any endpoint and never read into analytics (keeps the SP3-A
 * A5 guarantee). Everything else here is a numeric categorical score.
 */
export class SurveyDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 5, description: 'Was the programme helpful? (1–5)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  q1Helpful?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 5, description: 'Was the app easy to use? (1–5)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  q2Easy?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 5, description: 'Did it support your adherence? (1–5)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  q3AdherenceSupport?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 5, description: 'Would you recommend it? (1–5)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  q4Recommend?: number;

  @ApiPropertyOptional({
    description:
      'Optional free-text feedback. WRITE-ONLY — stored on the survey row, never returned by any endpoint and never read into analytics.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  freeText?: string;
}
