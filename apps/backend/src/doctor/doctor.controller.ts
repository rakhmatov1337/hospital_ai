import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PatientsService } from './patients.service';
import { DoctorService } from './doctor.service';
import {
  CreatePatientDto,
  UpdatePatientDto,
  CarePlanItemDto,
} from './doctor.dto';
import { JwtAuthGuard, RolesGuard, TenantGuard } from '../auth/guards';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { JwtPayload } from '../auth/auth.types';

@ApiTags('doctor')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles('DOCTOR')
@Controller()
export class DoctorController {
  constructor(
    private readonly patientsSvc: PatientsService,
    private readonly doctor: DoctorService,
  ) {}

  private ctx(u: JwtPayload) {
    return { userId: u.sub, hospitalId: u.hospitalId as string };
  }

  // ---- dashboard / analytics ----
  @Get('doctor/dashboard')
  dashboard(@CurrentUser() u: JwtPayload) {
    return this.doctor.dashboard(u.sub);
  }

  @Get('doctor/analytics')
  analytics(@CurrentUser() u: JwtPayload) {
    return this.doctor.analytics(u.sub);
  }

  // ---- patients ----
  @Post('patients')
  createPatient(@CurrentUser() u: JwtPayload, @Body() dto: CreatePatientDto) {
    return this.patientsSvc.create(this.ctx(u), dto);
  }

  @Get('patients')
  listPatients(@CurrentUser() u: JwtPayload, @Query('status') status?: string) {
    return this.patientsSvc.list(u.sub, status);
  }

  @Get('patients/:id')
  patientDetail(@CurrentUser() u: JwtPayload, @Param('id') id: string) {
    return this.patientsSvc.detail(u.sub, id);
  }

  @Patch('patients/:id')
  updatePatient(
    @CurrentUser() u: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdatePatientDto,
  ) {
    return this.patientsSvc.update(u.sub, id, dto);
  }

  // ---- care plan ----
  @Get('patients/:id/care-plan')
  carePlan(@CurrentUser() u: JwtPayload, @Param('id') id: string) {
    return this.patientsSvc.getCarePlan(u.sub, id);
  }

  @Post('patients/:id/care-plan/items')
  addItem(
    @CurrentUser() u: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CarePlanItemDto,
  ) {
    return this.patientsSvc.addItem(u.sub, id, dto);
  }

  @Patch('care-plan-items/:itemId')
  updateItem(
    @CurrentUser() u: JwtPayload,
    @Param('itemId') itemId: string,
    @Body() dto: CarePlanItemDto,
  ) {
    return this.patientsSvc.updateItem(u.sub, itemId, dto);
  }

  @Delete('care-plan-items/:itemId')
  deleteItem(@CurrentUser() u: JwtPayload, @Param('itemId') itemId: string) {
    return this.patientsSvc.deleteItem(u.sub, itemId);
  }

  @Post('care-plan/:planId/approve')
  approve(@CurrentUser() u: JwtPayload, @Param('planId') planId: string) {
    return this.patientsSvc.approveCarePlan(u.sub, planId);
  }

  // ---- check-ins / risk ----
  @Get('patients/:id/check-ins')
  checkIns(@CurrentUser() u: JwtPayload, @Param('id') id: string) {
    return this.patientsSvc.checkInsFor(u.sub, id);
  }

  @Get('patients/:id/risk-history')
  riskHistory(@CurrentUser() u: JwtPayload, @Param('id') id: string) {
    return this.patientsSvc.riskHistory(u.sub, id);
  }

  // ---- alerts ----
  @Get('alerts')
  alerts(@CurrentUser() u: JwtPayload) {
    return this.doctor.listAlerts(u.sub);
  }

  @Patch('alerts/:id/read')
  readAlert(@CurrentUser() u: JwtPayload, @Param('id') id: string) {
    return this.doctor.markRead(u.sub, id);
  }

  @Patch('alerts/:id/dismiss')
  dismissAlert(@CurrentUser() u: JwtPayload, @Param('id') id: string) {
    return this.doctor.dismiss(u.sub, id);
  }
}
