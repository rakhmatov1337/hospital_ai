import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Query for `GET /v1/me/content` (P14–P15, Learn). `category` selects the content
 * bucket; only `education` is unlockable in the MVP (defaults to `education`).
 */
export class MeContentQueryDto {
  @ApiPropertyOptional({
    default: 'education',
    description: 'Content category to list. MVP unlocks only "education".',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;
}
