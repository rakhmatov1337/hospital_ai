import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './patients.dto';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { JwtPayload } from '../auth/auth.types';

@ApiTags('patients')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Post()
  @Roles('DOCTOR')
  @ApiOperation({ summary: 'Create patient + access code + AI care plan' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreatePatientDto) {
    return this.patients.create(user.sub, dto);
  }

  @Get()
  @Roles('DOCTOR')
  @ApiOperation({ summary: "Doctor's patients with status + last check-in" })
  list(@CurrentUser() user: JwtPayload) {
    return this.patients.findAllForDoctor(user.sub);
  }

  @Get(':id')
  @Roles('DOCTOR')
  findOne(@Param('id') id: string) {
    return this.patients.findOne(id);
  }
}
