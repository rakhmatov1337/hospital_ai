import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../entities/user.entity';
import { Patient } from '../entities/patient.entity';
import { Alert } from '../entities/alert.entity';
import { Complaint } from '../entities/complaint.entity';
import { CheckIn } from '../entities/check-in.entity';
import { RiskAssessment } from '../entities/risk-assessment.entity';
import { RecoveryPoint } from '../entities/recovery-point.entity';
import { CarePlan } from '../entities/care-plan.entity';
import { CarePlanItem } from '../entities/care-plan-item.entity';
import { JwtAuthGuard, RolesGuard, TenantGuard } from '../auth/guards';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { JwtPayload } from '../auth/auth.types';
import { postOpDay } from '../common/dates';

class CreateDoctorDto {
  @ApiProperty({ example: 'Dr. Amir Karimov' })
  @IsString()
  fullName!: string;

  @ApiProperty({ example: 'amir@hospital.ai' })
  @IsString()
  email!: string;

  @ApiProperty({ example: 'doctor123' })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({ example: 'Chief Oncologist', required: false })
  @IsOptional()
  @IsString()
  title?: string;
}

class UpdateDoctorDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  title?: string;
}

class UpdateComplaintStatusDto {
  @ApiProperty({ enum: ['NEW', 'REVIEWED', 'RESOLVED'] })
  @IsIn(['NEW', 'REVIEWED', 'RESOLVED'])
  status!: 'NEW' | 'REVIEWED' | 'RESOLVED';
}

class UpdateAlertStatusDto {
  @ApiProperty({ enum: ['UNREAD', 'READ', 'DISMISSED'] })
  @IsIn(['UNREAD', 'READ', 'DISMISSED'])
  status!: 'UNREAD' | 'READ' | 'DISMISSED';
}

@ApiTags('hospital-admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles('HOSPITAL_ADMIN')
@Controller()
class HospitalController {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>,
    @InjectRepository(Complaint)
    private readonly complaints: Repository<Complaint>,
    @InjectRepository(CheckIn) private readonly checkIns: Repository<CheckIn>,
    @InjectRepository(RiskAssessment)
    private readonly risks: Repository<RiskAssessment>,
    @InjectRepository(RecoveryPoint)
    private readonly points: Repository<RecoveryPoint>,
    @InjectRepository(CarePlan) private readonly plans: Repository<CarePlan>,
    @InjectRepository(CarePlanItem)
    private readonly planItems: Repository<CarePlanItem>,
  ) {}

  private hid(u: JwtPayload): string {
    return u.hospitalId as string;
  }

  private safeDoctor(u: User) {
    return {
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      title: u.title,
      createdAt: u.createdAt,
    };
  }

  @Get('hospital/overview')
  async overview(@CurrentUser() u: JwtPayload) {
    const hospitalId = this.hid(u);
    const doctors = await this.users.count({
      where: { hospitalId, role: 'DOCTOR' },
    });
    const all = await this.patients.find({ where: { hospitalId } });
    return {
      doctors,
      patients: all.length,
      atRisk: all.filter((p) => p.status === 'AT_RISK').length,
      recovering: all.filter((p) => p.status === 'RECOVERING').length,
      recovered: all.filter((p) => p.status === 'RECOVERED').length,
      unreadAlerts: await this.alerts.count({
        where: { hospitalId, status: 'UNREAD' },
      }),
      newComplaints: await this.complaints.count({
        where: { hospitalId, status: 'NEW' },
      }),
    };
  }

  @Post('doctors')
  async createDoctor(
    @CurrentUser() u: JwtPayload,
    @Body() dto: CreateDoctorDto,
  ) {
    const doctor = await this.users.save(
      this.users.create({
        fullName: dto.fullName,
        email: dto.email,
        passwordHash: bcrypt.hashSync(dto.password, 10),
        role: 'DOCTOR',
        title: dto.title ?? null,
        hospitalId: this.hid(u),
      }),
    );
    return this.safeDoctor(doctor);
  }

  @Get('doctors')
  async listDoctors(@CurrentUser() u: JwtPayload) {
    const docs = await this.users.find({
      where: { hospitalId: this.hid(u), role: 'DOCTOR' },
      order: { createdAt: 'DESC' },
    });
    const out = [];
    for (const d of docs) {
      const patientCount = await this.patients.count({
        where: { doctorId: d.id },
      });
      out.push({ ...this.safeDoctor(d), patientCount });
    }
    return out;
  }

  @Get('doctors/:id')
  async getDoctor(@CurrentUser() u: JwtPayload, @Param('id') id: string) {
    const d = await this.users.findOne({
      where: { id, hospitalId: this.hid(u), role: 'DOCTOR' },
    });
    return d ? this.safeDoctor(d) : null;
  }

  @Patch('doctors/:id')
  async updateDoctor(
    @CurrentUser() u: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateDoctorDto,
  ) {
    const d = await this.users.findOne({
      where: { id, hospitalId: this.hid(u), role: 'DOCTOR' },
    });
    if (!d) return null;
    if (dto.fullName) d.fullName = dto.fullName;
    if (dto.title !== undefined) d.title = dto.title;
    await this.users.save(d);
    return this.safeDoctor(d);
  }

  @Get('hospital/patients')
  async patientsList(@CurrentUser() u: JwtPayload) {
    const rows = await this.patients.find({
      where: { hospitalId: this.hid(u) },
      order: { createdAt: 'DESC' },
    });
    return rows.map((p) => ({
      id: p.id,
      publicId: p.publicId,
      fullName: p.user?.fullName,
      status: p.status,
      recoveryScore: p.recoveryScore,
      surgeryType: p.surgeryType?.name,
      doctorId: p.doctorId,
    }));
  }

  // Read-only patient detail for hospital admin — scoped to the hospital,
  // not to a single doctor (admins see every patient in their hospital).
  @Get('hospital/patients/:id')
  async patientDetail(@CurrentUser() u: JwtPayload, @Param('id') id: string) {
    const hospitalId = this.hid(u);
    const p = await this.patients.findOne({ where: { id, hospitalId } });
    if (!p) return null;

    const [doctor, plan, latestRisk, recentCheckIns, trend, openAlerts] =
      await Promise.all([
        this.users.findOne({
          where: { id: p.doctorId, hospitalId, role: 'DOCTOR' },
        }),
        this.plans.findOne({
          where: { patientId: id },
          order: { createdAt: 'DESC' },
        }),
        this.risks.findOne({
          where: { patientId: id },
          order: { createdAt: 'DESC' },
        }),
        this.checkIns.find({
          where: { patientId: id },
          order: { createdAt: 'DESC' },
          take: 10,
        }),
        this.points.find({
          where: { patientId: id },
          order: { date: 'ASC' },
        }),
        this.alerts.find({
          where: { patientId: id, hospitalId, status: 'UNREAD' },
          order: { createdAt: 'DESC' },
        }),
      ]);

    const itemCount = plan
      ? await this.planItems.count({ where: { carePlanId: plan.id } })
      : 0;

    return {
      id: p.id,
      publicId: p.publicId,
      fullName: p.user?.fullName,
      age: p.age,
      status: p.status,
      recoveryScore: p.recoveryScore,
      surgeryType: p.surgeryType?.name,
      surgeryDate: p.surgeryDate,
      postOpDay: postOpDay(p.surgeryDate),
      doctor: doctor
        ? { id: doctor.id, fullName: doctor.fullName, title: doctor.title }
        : null,
      carePlan: plan
        ? {
            id: plan.id,
            status: plan.status,
            source: plan.source,
            confidence: plan.confidence,
            itemCount,
          }
        : null,
      latestRisk: latestRisk
        ? {
            riskLevel: latestRisk.riskLevel,
            advice: latestRisk.advice,
            confidence: latestRisk.confidence,
            createdAt: latestRisk.createdAt,
          }
        : null,
      recentCheckIns: recentCheckIns.map((c) => ({
        id: c.id,
        date: c.date,
        painLevel: c.painLevel,
        temperature: c.temperature,
        bpm: c.bpm,
        spo2: c.spo2,
        mood: c.mood,
        symptoms: c.symptoms ?? [],
        riskLevel: c.riskLevel,
        source: c.source,
        createdAt: c.createdAt,
      })),
      recoveryTrend: trend.map((t) => ({ date: t.date, score: t.score })),
      openAlerts: openAlerts.map((a) => ({
        id: a.id,
        severity: a.severity,
        title: a.title,
        message: a.message,
        createdAt: a.createdAt,
      })),
    };
  }

  // Anonymous complaints — patient identity is intentionally NOT returned.
  @Get('complaints')
  async complaintsList(
    @CurrentUser() u: JwtPayload,
    @Query('status') status?: string,
    @Query('urgency') urgency?: string,
  ) {
    const where: Record<string, unknown> = { hospitalId: this.hid(u) };
    if (status) where.status = status;
    if (urgency) where.urgency = urgency;
    const rows = await this.complaints.find({
      where,
      order: { createdAt: 'DESC' },
    });
    return rows.map((c) => ({
      id: c.id,
      category: c.category,
      description: c.description,
      urgency: c.urgency,
      status: c.status,
      createdAt: c.createdAt,
    }));
  }

  @Patch('complaints/:id')
  async updateComplaint(
    @CurrentUser() u: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateComplaintStatusDto,
  ) {
    const c = await this.complaints.findOne({
      where: { id, hospitalId: this.hid(u) },
    });
    if (!c) return null;
    c.status = dto.status;
    await this.complaints.save(c);
    return { id: c.id, status: c.status };
  }

  // Clinical alerts across the whole hospital (risk check-ins + AI chat
  // escalations). Unlike complaints, alerts carry patient identity so staff
  // can act on them.
  @Get('hospital/alerts')
  async alertsList(
    @CurrentUser() u: JwtPayload,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
  ) {
    const where: Record<string, unknown> = { hospitalId: this.hid(u) };
    if (status) where.status = status;
    if (severity) where.severity = severity;
    const rows = await this.alerts.find({
      where,
      order: { createdAt: 'DESC' },
    });
    return rows.map((a) => ({
      id: a.id,
      type: a.type,
      severity: a.severity,
      title: a.title,
      message: a.message,
      actionLabel: a.actionLabel,
      status: a.status,
      createdAt: a.createdAt,
      doctorId: a.doctorId,
      patient: a.patient
        ? {
            id: a.patient.id,
            publicId: a.patient.publicId,
            fullName: a.patient.user?.fullName,
          }
        : null,
    }));
  }

  @Patch('hospital/alerts/:id')
  async updateAlert(
    @CurrentUser() u: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateAlertStatusDto,
  ) {
    const a = await this.alerts.findOne({
      where: { id, hospitalId: this.hid(u) },
    });
    if (!a) return null;
    a.status = dto.status;
    await this.alerts.save(a);
    return { id: a.id, status: a.status };
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Patient,
      Alert,
      Complaint,
      CheckIn,
      RiskAssessment,
      RecoveryPoint,
      CarePlan,
      CarePlanItem,
    ]),
  ],
  controllers: [HospitalController],
})
export class HospitalModule {}
