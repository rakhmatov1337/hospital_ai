import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

/**
 * Query for `GET /v1/metrics`. Optional `from`/`to` bound the report to a date
 * window; omitting both yields the all-time report (the dashboard's "All" preset).
 *
 * The dashboard sends date-only ISO strings (`YYYY-MM-DD`); full ISO datetimes are
 * also accepted. `to` is treated as INCLUSIVE of the whole day (see `parseWindow`).
 */
export class MetricsQueryDto {
  @ApiPropertyOptional({
    description: 'Inclusive start of the window (ISO date `YYYY-MM-DD` or full ISO datetime). Omit for all-time.',
    example: '2026-07-18',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Inclusive end of the window (ISO date `YYYY-MM-DD` or full ISO datetime). Omit for all-time.',
    example: '2026-07-25',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}
