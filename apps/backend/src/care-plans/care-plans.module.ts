import { Module, Injectable, NotFoundException } from '@nestjs/common';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CarePlan } from '../entities/care-plan.entity';
import { CarePlanItem } from '../entities/care-plan-item.entity';
import { Patient } from '../entities/patient.entity';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { JwtPayload } from '../auth/auth.types';

@Injectable()
class CarePlansService {
  constructor(
    @InjectRepository(CarePlan) private readonly plans: Repository<CarePlan>,
    @InjectRepository(CarePlanItem)
    private readonly items: Repository<CarePlanItem>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
  ) {}

  async forPatient(patientId: string) {
    const plan = await this.plans.findOne({
      where: { patientId },
      relations: { items: true },
    });
    if (!plan) return { items: [], grouped: {}, generatedByAi: false };
    const items = [...plan.items].sort((a, b) => a.dayOffset - b.dayOffset);
    const grouped: Record<number, CarePlanItem[]> = {};
    for (const it of items) (grouped[it.dayOffset] ??= []).push(it);
    return { id: plan.id, generatedByAi: plan.generatedByAi, grouped, items };
  }

  async today(patientId: string) {
    const patient = await this.patients.findOne({ where: { id: patientId } });
    if (!patient) throw new NotFoundException('Patient not found');
    const day = Math.max(
      0,
      Math.floor((Date.now() - new Date(patient.surgeryDate).getTime()) / 86_400_000),
    );
    const plan = await this.plans.findOne({
      where: { patientId },
      relations: { items: true },
    });
    return { day, items: plan?.items.filter((i) => i.dayOffset === day) ?? [] };
  }

  async complete(itemId: string) {
    const item = await this.items.findOne({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Care plan item not found');
    item.isCompleted = true;
    return this.items.save(item);
  }
}

@ApiTags('care-plans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
class CarePlansController {
  constructor(private readonly service: CarePlansService) {}

  @Get('patients/:id/care-plan')
  @Roles('DOCTOR')
  forPatient(@Param('id') id: string) {
    return this.service.forPatient(id);
  }

  @Get('care-plan/today')
  @Roles('PATIENT')
  today(@CurrentUser() user: JwtPayload) {
    return this.service.today(user.patientId!);
  }

  @Patch('care-plan-items/:id/complete')
  complete(@Param('id') id: string) {
    return this.service.complete(id);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([CarePlan, CarePlanItem, Patient])],
  controllers: [CarePlansController],
  providers: [CarePlansService],
})
export class CarePlansModule {}
