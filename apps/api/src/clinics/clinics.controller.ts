import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Audience, StaffJwtGuard } from '../auth/guards';
import { RequestContext } from '../common/request-context';
import { ClinicsService, ClinicView } from './clinics.service';
import { UpdateClinicDto } from './dto/update-clinic.dto';

/** Clinic API. Staff-only; the clinic is taken from the authenticated token. */
@ApiTags('clinics')
@Controller('clinics')
@Audience('staff')
@UseGuards(StaffJwtGuard)
export class ClinicsController {
  constructor(
    private readonly clinicsService: ClinicsService,
    private readonly ctx: RequestContext,
  ) {}

  @Get('me')
  @ApiOperation({ summary: "Get the authenticated staff member's clinic." })
  @ApiOkResponse({ description: 'Clinic configuration for the current staff token.' })
  me(): Promise<ClinicView> {
    return this.clinicsService.get(this.ctx.requireClinicId());
  }

  @Patch('me')
  @ApiOperation({
    summary:
      "Update the authenticated clinic's settings. Name/phone/emergency changes are audit-logged (actor + timestamp).",
  })
  @ApiOkResponse({ description: 'The updated clinic configuration.' })
  updateMe(@Body() dto: UpdateClinicDto): Promise<ClinicView> {
    return this.clinicsService.update(this.ctx.requireClinicId(), dto);
  }
}
