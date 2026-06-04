import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../entities/user.entity';
import { Patient } from '../entities/patient.entity';
import { Alert } from '../entities/alert.entity';
import { JwtAuthGuard, RolesGuard, TenantGuard } from '../auth/guards';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { JwtPayload } from '../auth/auth.types';

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
}

@Module({
  imports: [TypeOrmModule.forFeature([User, Patient, Alert])],
  controllers: [HospitalController],
})
export class HospitalModule {}
