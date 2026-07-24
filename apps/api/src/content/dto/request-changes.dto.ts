import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body for `POST /v1/content/translations/:id/request-changes`. Both fields are
 * optional. `text` is the proposed replacement wording (a NEW draft version is
 * created from it — the approved row is never mutated). `note` is the reviewer's
 * reason, recorded to the append-only AuditLog.
 */
export class RequestChangesDto {
  @ApiPropertyOptional({ description: 'Proposed replacement text for the new draft version.' })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  text?: string;

  @ApiPropertyOptional({ description: 'Reviewer note explaining the requested change (audit-logged).' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
