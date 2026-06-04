import { Module, Injectable, NotFoundException } from '@nestjs/common';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CheckIn } from '../entities/check-in.entity';
import { Patient } from '../entities/patient.entity';
import { Alert } from '../entities/alert.entity';
import { CheckInDto } from '../ai/risk/risk.dto';
import { assessRisk, RiskAgent } from '../ai/risk/risk.service';
import { riskAgent } from '../ai/mastra/agents/risk.agent';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { JwtPayload } from '../auth/auth.types';

@Injectable()
class CheckInsService {
  constructor(
    @InjectRepository(CheckIn) private readonly checkIns: Repository<CheckIn>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>,
  ) {}

  async create(patientId: string, dto: CheckInDto) {
    const patient = await this.patients.findOne({ where: { id: patientId } });
    if (!patient) throw new NotFoundException('Patient not found');
    const recoveryDay = Math.max(
      0,
      Math.floor((Date.now() - new Date(patient.surgeryDate).getTime()) / 86_400_000),
    );

    const risk = await assessRisk(riskAgent as unknown as RiskAgent, {
      painLevel: dto.painLevel,
      temperature: dto.temperature,
      symptoms: dto.symptoms,
      mood: dto.mood,
      notes: dto.notes,
      recoveryDay,
    });

    const checkIn = await this.checkIns.save(
      this.checkIns.create({
        patientId,
        painLevel: dto.painLevel,
        temperature: dto.temperature,
        symptoms: dto.symptoms,
        mood: dto.mood,
        notes: dto.notes,
        riskLevel: risk.riskLevel,
      }),
    );

    if (risk.riskLevel === 'HIGH') {
      await this.alerts.save(
        this.alerts.create({
          patientId,
          type: 'RISK',
          severity: 'CRITICAL',
          message: risk.advice,
        }),
      );
      await this.patients.update(patientId, { status: 'AT_RISK' });
    }

    return {
      checkIn,
      riskLevel: risk.riskLevel,
      advice: risk.advice,
      confidence: risk.confidence,
    };
  }

  listForPatient(patientId: string) {
    return this.checkIns.find({
      where: { patientId },
      order: { date: 'DESC' },
    });
  }
}

@ApiTags('check-ins')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
class CheckInsController {
  constructor(private readonly service: CheckInsService) {}

  @Post('check-ins')
  @Roles('PATIENT')
  create(@CurrentUser() user: JwtPayload, @Body() dto: CheckInDto) {
    return this.service.create(user.patientId!, dto);
  }

  @Get('patients/:id/check-ins')
  @Roles('DOCTOR')
  list(@Param('id') id: string) {
    return this.service.listForPatient(id);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([CheckIn, Patient, Alert])],
  controllers: [CheckInsController],
  providers: [CheckInsService],
})
export class CheckInsModule {}
