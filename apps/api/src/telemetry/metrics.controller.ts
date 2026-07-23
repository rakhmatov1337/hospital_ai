import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Audience, StaffJwtGuard } from '../auth/guards';
import { RequestContext } from '../common/request-context';
import { MetricsReport, MetricsService } from './metrics.service';

/**
 * Staff-facing pilot metrics (design spec §9). Read-only: it derives counts,
 * ratios and medians from the append-only Event stream and the domain tables and
 * writes nothing. The clinic is taken from the authenticated staff token via
 * RequestContext, never from the request, so one clinic can never read another's.
 */
@ApiTags('metrics')
@Controller('metrics')
@Audience('staff')
@UseGuards(StaffJwtGuard)
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly ctx: RequestContext,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Pilot metrics for the authenticated clinic: adherence (overall/by-day/by-type), retention, check-in completion, escalations, language split, satisfaction and raw readmission count — every metric carries its denominator.',
  })
  @ApiOkResponse({ description: 'The pilot metrics report (each ratio carries its numerator + denominator).' })
  get(): Promise<MetricsReport> {
    return this.metrics.compute(this.ctx.requireClinicId());
  }
}
