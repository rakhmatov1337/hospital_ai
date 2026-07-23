import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService, PatientSession, StaffSession } from './auth.service';
import { StaffLoginDto } from './dto/staff-login.dto';
import { PatientSessionDto } from './dto/patient-session.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('staff/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Staff login (email + password) -> 8h staff access token.' })
  staffLogin(@Body() dto: StaffLoginDto): Promise<StaffSession> {
    return this.authService.staffLogin(dto.email, dto.password);
  }

  @Post('patient/session')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Patient session (single-use enrolment code + phone) -> 24h access + 60d refresh.',
  })
  patientSession(@Body() dto: PatientSessionDto): Promise<PatientSession> {
    return this.authService.patientSession(dto.code, dto.phone);
  }
}
