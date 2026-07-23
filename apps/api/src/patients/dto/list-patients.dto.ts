import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Cursor-based pagination for the (clinic-scoped) patient list.
 *
 * Cursor is an opaque patient id; results are ordered by id ascending so the
 * cursor is stable. (Cursor pagination is fine for patients — it is NEVER applied
 * to the escalation queue, where nothing may hide an unresolved urgent item.)
 */
export class ListPatientsQueryDto {
  @ApiPropertyOptional({ description: 'Opaque cursor: the id of the last patient from the previous page.' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
