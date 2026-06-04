import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { Patient } from '../entities/patient.entity';
import { SurgeryType } from '../entities/surgery-type.entity';
import { CarePlan } from '../entities/care-plan.entity';
import { CarePlanItem } from '../entities/care-plan-item.entity';
import { CheckIn } from '../entities/check-in.entity';
import { CreatePatientDto } from './patients.dto';
import {
  generateCarePlan,
  CarePlanAgent,
} from '../ai/care-plan/care-plan.service';
import { carePlanAgent } from '../ai/mastra/agents/care-plan.agent';

function recoveryDayOf(surgeryDate: string): number {
  const diff = Date.now() - new Date(surgeryDate).getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

@Injectable()
export class PatientsService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(SurgeryType)
    private readonly surgeryTypes: Repository<SurgeryType>,
    @InjectRepository(CarePlan) private readonly carePlans: Repository<CarePlan>,
    @InjectRepository(CarePlanItem)
    private readonly items: Repository<CarePlanItem>,
    @InjectRepository(CheckIn) private readonly checkIns: Repository<CheckIn>,
  ) {}

  async create(doctorId: string, dto: CreatePatientDto) {
    const surgeryType = await this.surgeryTypes.findOne({
      where: { id: dto.surgeryTypeId },
    });
    if (!surgeryType) throw new NotFoundException('Surgery type not found');

    const user = await this.users.save(
      this.users.create({
        fullName: dto.fullName,
        phone: dto.phone,
        role: 'PATIENT',
      }),
    );

    const accessCode = String(Math.floor(100000 + Math.random() * 900000));
    const isPreOp = new Date(dto.surgeryDate).getTime() > Date.now();
    const patient = await this.patients.save(
      this.patients.create({
        userId: user.id,
        doctorId,
        surgeryTypeId: surgeryType.id,
        surgeryDate: dto.surgeryDate,
        status: isPreOp ? 'PRE_OP' : 'RECOVERING',
        accessCode,
      }),
    );

    // AI care plan (has its own template fallback if AI is down)
    const ai = await generateCarePlan(
      carePlanAgent as unknown as CarePlanAgent,
      surgeryType.name,
      new Date(dto.surgeryDate),
    );
    await this.carePlans.save(
      this.carePlans.create({
        patientId: patient.id,
        generatedByAi: ai.generatedByAi,
        items: ai.items.map((i) =>
          this.items.create({ ...i, scheduleTime: i.scheduleTime ?? undefined }),
        ),
      }),
    );

    return { patient, accessCode };
  }

  async findAllForDoctor(doctorId: string) {
    const list = await this.patients.find({
      where: { doctorId },
      order: { createdAt: 'DESC' },
    });
    return Promise.all(
      list.map(async (p) => ({
        ...p,
        recoveryDay: recoveryDayOf(p.surgeryDate),
        lastCheckIn: await this.checkIns.findOne({
          where: { patientId: p.id },
          order: { date: 'DESC' },
        }),
      })),
    );
  }

  async findOne(id: string) {
    const patient = await this.patients.findOne({ where: { id } });
    if (!patient) throw new NotFoundException('Patient not found');
    return { ...patient, recoveryDay: recoveryDayOf(patient.surgeryDate) };
  }
}
