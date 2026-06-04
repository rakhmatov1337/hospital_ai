import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { Patient } from '../entities/patient.entity';
import { SurgeryType } from '../entities/surgery-type.entity';
import { CarePlan } from '../entities/care-plan.entity';
import { CarePlanItem } from '../entities/care-plan-item.entity';
import { CheckIn } from '../entities/check-in.entity';
import { RiskAssessment } from '../entities/risk-assessment.entity';
import { RecoveryPoint } from '../entities/recovery-point.entity';
import { CreatePatientDto, UpdatePatientDto, CarePlanItemDto } from './doctor.dto';
import { postOpDay, today } from '../common/dates';
import { mastra } from '../ai/mastra';
import { patientOnboardingWorkflow } from '../ai/mastra/workflows/patient-onboarding.workflow';

interface DoctorCtx {
  userId: string;
  hospitalId: string;
}

@Injectable()
export class PatientsService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(SurgeryType)
    private readonly surgeryTypes: Repository<SurgeryType>,
    @InjectRepository(CarePlan) private readonly plans: Repository<CarePlan>,
    @InjectRepository(CarePlanItem)
    private readonly items: Repository<CarePlanItem>,
    @InjectRepository(CheckIn) private readonly checkIns: Repository<CheckIn>,
    @InjectRepository(RiskAssessment)
    private readonly risks: Repository<RiskAssessment>,
    @InjectRepository(RecoveryPoint)
    private readonly points: Repository<RecoveryPoint>,
  ) {}

  private async owned(id: string, doctorId: string): Promise<Patient> {
    const p = await this.patients.findOne({ where: { id } });
    if (!p) throw new NotFoundException('Patient not found');
    if (p.doctorId !== doctorId) throw new ForbiddenException('Not your patient');
    return p;
  }

  private async genAccessCode(): Promise<string> {
    for (let i = 0; i < 20; i++) {
      const code = `HOSP-${Math.floor(1000 + Math.random() * 9000)}`;
      if (!(await this.patients.findOne({ where: { accessCode: code } })))
        return code;
    }
    return `HOSP-${Date.now().toString().slice(-6)}`;
  }

  async create(ctx: DoctorCtx, dto: CreatePatientDto) {
    const surgery = await this.surgeryTypes.findOne({
      where: { id: dto.surgeryTypeId },
    });
    if (!surgery) throw new NotFoundException('Surgery type not found');

    const user = await this.users.save(
      this.users.create({
        fullName: dto.fullName,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        role: 'PATIENT',
        hospitalId: ctx.hospitalId,
      }),
    );

    const count = await this.patients.count();
    const accessCode = await this.genAccessCode();
    const patient = await this.patients.save(
      this.patients.create({
        publicId: `PX-${1000 + count}`,
        userId: user.id,
        hospitalId: ctx.hospitalId,
        doctorId: ctx.userId,
        surgeryTypeId: surgery.id,
        surgeryDate: dto.surgeryDate,
        status: 'RECOVERING',
        accessCode,
        age: dto.age ?? null,
        recoveryScore: 60,
      }),
    );

    // Generate the AI care plan (DRAFT) via the onboarding workflow.
    void mastra;
    let carePlanSummary: {
      carePlanId: string;
      itemCount: number;
      confidence: number;
      modelUsed: string;
      fallbackUsed: boolean;
    } | null = null;
    try {
      const run = await patientOnboardingWorkflow.createRun();
      const res = await run.start({
        inputData: {
          patientId: patient.id,
          surgeryTypeId: surgery.id,
          surgeryType: surgery.name,
          surgeryDate: dto.surgeryDate,
        },
      });
      if (res.status === 'success') carePlanSummary = res.result;
    } catch {
      /* care plan can be retried; patient is still created */
    }

    return {
      patient: this.shape(patient, surgery),
      accessCode,
      carePlan: carePlanSummary
        ? { ...carePlanSummary, status: 'DRAFT' }
        : null,
    };
  }

  private shape(p: Patient, surgery?: SurgeryType) {
    return {
      id: p.id,
      publicId: p.publicId,
      fullName: p.user?.fullName,
      age: p.age,
      status: p.status,
      recoveryScore: p.recoveryScore,
      accessCode: p.accessCode,
      surgeryType: surgery?.name ?? p.surgeryType?.name,
      surgeryDate: p.surgeryDate,
      postOpDay: postOpDay(p.surgeryDate),
    };
  }

  async list(doctorId: string, status?: string) {
    const where = status
      ? { doctorId, status: status as Patient['status'] }
      : { doctorId };
    const rows = await this.patients.find({
      where,
      order: { createdAt: 'DESC' },
    });
    const out = [];
    for (const p of rows) {
      const last = await this.checkIns.findOne({
        where: { patientId: p.id },
        order: { createdAt: 'DESC' },
      });
      out.push({
        ...this.shape(p),
        lastCheckIn: last
          ? { date: last.date, painLevel: last.painLevel, bpm: last.bpm, spo2: last.spo2 }
          : null,
      });
    }
    return out;
  }

  async detail(doctorId: string, id: string) {
    const p = await this.owned(id, doctorId);
    const checkIns = await this.checkIns.find({
      where: { patientId: id },
      order: { createdAt: 'DESC' },
      take: 10,
    });
    return { ...this.shape(p), recentCheckIns: checkIns };
  }

  async update(doctorId: string, id: string, dto: UpdatePatientDto) {
    const p = await this.owned(id, doctorId);
    if (dto.status) p.status = dto.status;
    await this.patients.save(p);
    return this.shape(p);
  }

  private async activePlan(patientId: string): Promise<CarePlan | null> {
    return (
      (await this.plans.findOne({
        where: { patientId, status: 'ACTIVE' },
        order: { createdAt: 'DESC' },
      })) ??
      (await this.plans.findOne({
        where: { patientId },
        order: { createdAt: 'DESC' },
      }))
    );
  }

  async getCarePlan(doctorId: string, id: string) {
    await this.owned(id, doctorId);
    const plan = await this.activePlan(id);
    if (!plan) return { plan: null, items: [] };
    const items = await this.items.find({ where: { carePlanId: plan.id } });
    return {
      plan: {
        id: plan.id,
        status: plan.status,
        source: plan.source,
        confidence: plan.confidence,
        reasoning: plan.aiReasoning,
        modelUsed: plan.modelUsed,
      },
      items,
    };
  }

  async addItem(doctorId: string, id: string, dto: CarePlanItemDto) {
    await this.owned(id, doctorId);
    const plan = await this.activePlan(id);
    if (!plan) throw new NotFoundException('No care plan to add to');
    const item = await this.items.save(
      this.items.create({
        carePlanId: plan.id,
        patientId: id,
        type: dto.type,
        title: dto.title,
        description: dto.description,
        dosage: dto.dosage ?? null,
        frequency: dto.frequency ?? null,
        scheduleTimes: dto.scheduleTimes,
        startDay: dto.startDay ?? 0,
        durationDays: dto.durationDays ?? null,
      }),
    );
    return item;
  }

  async updateItem(doctorId: string, itemId: string, dto: CarePlanItemDto) {
    const item = await this.items.findOne({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Item not found');
    await this.owned(item.patientId, doctorId);
    Object.assign(item, {
      type: dto.type ?? item.type,
      title: dto.title ?? item.title,
      description: dto.description ?? item.description,
      dosage: dto.dosage ?? item.dosage,
      frequency: dto.frequency ?? item.frequency,
      scheduleTimes: dto.scheduleTimes ?? item.scheduleTimes,
      startDay: dto.startDay ?? item.startDay,
      durationDays: dto.durationDays ?? item.durationDays,
    });
    return this.items.save(item);
  }

  async deleteItem(doctorId: string, itemId: string) {
    const item = await this.items.findOne({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Item not found');
    await this.owned(item.patientId, doctorId);
    await this.items.remove(item);
    return { deleted: true };
  }

  async approveCarePlan(doctorId: string, planId: string) {
    const plan = await this.plans.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Care plan not found');
    await this.owned(plan.patientId, doctorId);
    plan.status = 'ACTIVE';
    plan.approvedByDoctorId = doctorId;
    await this.plans.save(plan);

    const patient = await this.patients.findOne({
      where: { id: plan.patientId },
    });
    if (patient) {
      const date = today();
      if (!(await this.points.findOne({ where: { patientId: patient.id, date } }))) {
        await this.points.save(
          this.points.create({
            patientId: patient.id,
            hospitalId: patient.hospitalId,
            date,
            score: patient.recoveryScore,
          }),
        );
      }
    }
    return { id: plan.id, status: plan.status };
  }

  async checkInsFor(doctorId: string, id: string) {
    await this.owned(id, doctorId);
    return this.checkIns.find({
      where: { patientId: id },
      order: { createdAt: 'DESC' },
    });
  }

  async riskHistory(doctorId: string, id: string) {
    await this.owned(id, doctorId);
    return this.risks.find({
      where: { patientId: id },
      order: { createdAt: 'DESC' },
    });
  }
}
