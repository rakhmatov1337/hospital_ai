import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  PatientDetailView,
  PatientListPage,
  ReissueCodeResult,
  WithdrawPatientResult,
} from '@hospital-ai/shared-types';
import { Audience, StaffJwtGuard } from '../auth/guards';
import { EnrolmentResult, EnrolmentService } from './enrolment.service';
import { PatientsService } from './patients.service';
import { EnrolPatientDto } from './dto/enrol-patient.dto';
import { ListPatientsQueryDto } from './dto/list-patients.dto';

/**
 * Staff-facing patient API. Every route requires an `aud:"staff"` token; the
 * clinic is taken from that token (RequestContext), never from the request.
 */
@ApiTags('patients')
@Controller('patients')
@Audience('staff')
@UseGuards(StaffJwtGuard)
export class PatientsController {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly enrolmentService: EnrolmentService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Enrol a patient (production-gated): creates the patient + consent and generates the 30-day task set.',
  })
  @ApiCreatedResponse({ description: 'Patient enrolled; enrolment code + task count returned.' })
  enrol(@Body() dto: EnrolPatientDto): Promise<EnrolmentResult> {
    return this.enrolmentService.enrol(dto);
  }

  @Get()
  @ApiOperation({
    summary:
      'List patients for the authenticated clinic (enriched: adherence %, last active, open escalations, attention flag).',
  })
  @ApiOkResponse({ description: "A cursor-paginated page of the clinic's enriched patients." })
  list(@Query() query: ListPatientsQueryDto): Promise<PatientListPage> {
    return this.patientsService.list(query.cursor, query.limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one patient (clinic-scoped; cross-clinic access forbidden).' })
  @ApiOkResponse({ description: 'Full patient detail (adherence series, task/check-in/escalation history, consent).' })
  get(@Param('id') id: string): Promise<PatientDetailView> {
    return this.patientsService.get(id);
  }

  @Post(':id/reissue-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Re-issue the patient enrolment code (invalidates the old code; single-use, 14-day expiry).',
  })
  @ApiOkResponse({ description: 'The new enrolment code + expiry.' })
  reissueCode(@Param('id') id: string): Promise<ReissueCodeResult> {
    return this.patientsService.reissueCode(id);
  }

  @Patch(':id/withdraw')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Withdraw a patient: stops future tasks/reminders, retains all history, flags status withdrawn.',
  })
  @ApiOkResponse({ description: 'The patient, now withdrawn.' })
  withdraw(@Param('id') id: string): Promise<WithdrawPatientResult> {
    return this.patientsService.withdraw(id);
  }
}
