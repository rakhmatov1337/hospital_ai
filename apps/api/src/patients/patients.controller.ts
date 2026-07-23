import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { Audience, StaffJwtGuard } from '../auth/guards';
import { EnrolmentResult, EnrolmentService } from './enrolment.service';
import {
  PatientDetail,
  PatientPage,
  PatientsService,
} from './patients.service';
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
  @ApiOperation({ summary: 'List patients for the authenticated clinic (cursor pagination).' })
  @ApiOkResponse({ description: 'A cursor-paginated page of the clinic\'s patients.' })
  list(@Query() query: ListPatientsQueryDto): Promise<PatientPage> {
    return this.patientsService.list(query.cursor, query.limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one patient (clinic-scoped; cross-clinic access forbidden).' })
  @ApiOkResponse({ description: 'Patient detail.' })
  get(@Param('id') id: string): Promise<PatientDetail> {
    return this.patientsService.get(id);
  }
}
