import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

/** Queue filter (SP2 spec §7): unresolved (default) vs the full history. */
export const ESCALATION_FILTERS = ['unresolved', 'all'] as const;
export type EscalationFilter = (typeof ESCALATION_FILTERS)[number];

/**
 * Query for `GET /v1/escalations`. Deliberately has **no pagination** — the queue
 * must never paginate, collapse, or hide an unresolved urgent item, so there is
 * no cursor/limit to omit one.
 */
export class ListEscalationsDto {
  @ApiPropertyOptional({
    description: 'Which escalations to show. Defaults to `unresolved`.',
    enum: ESCALATION_FILTERS,
    default: 'unresolved',
  })
  @IsOptional()
  @IsIn(ESCALATION_FILTERS as unknown as string[])
  filter?: EscalationFilter;
}
