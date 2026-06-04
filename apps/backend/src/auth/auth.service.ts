import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../entities/user.entity';
import { Patient } from '../entities/patient.entity';
import { LoginDto, PatientLoginDto } from './auth.dto';
import { JwtPayload } from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    private readonly jwt: JwtService,
  ) {}

  private sign(payload: JwtPayload): string {
    return this.jwt.sign(payload);
  }

  private safeUser(u: User) {
    return {
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      phone: u.phone,
      role: u.role,
      title: u.title,
      locale: u.locale,
      hospitalId: u.hospitalId,
    };
  }

  // Email + password login for SUPERADMIN / HOSPITAL_ADMIN / DOCTOR.
  async login(dto: LoginDto) {
    const user = await this.users.findOne({ where: { email: dto.email } });
    if (
      !user?.passwordHash ||
      !bcrypt.compareSync(dto.password, user.passwordHash)
    ) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.role === 'PATIENT') {
      throw new UnauthorizedException('Patients must use the access code login');
    }
    return {
      accessToken: this.sign({
        sub: user.id,
        role: user.role,
        hospitalId: user.hospitalId ?? null,
      }),
      user: this.safeUser(user),
    };
  }

  // Access-code login for patients.
  async patientLogin(dto: PatientLoginDto) {
    const patient = await this.patients.findOne({
      where: { accessCode: dto.accessCode },
    });
    if (!patient) throw new UnauthorizedException('Invalid access code');
    const user = await this.users.findOne({ where: { id: patient.userId } });
    if (!user) throw new UnauthorizedException('Patient user not found');
    return {
      accessToken: this.sign({
        sub: user.id,
        role: 'PATIENT',
        hospitalId: patient.hospitalId,
        patientId: patient.id,
      }),
      user: this.safeUser(user),
      patient,
    };
  }

  async me(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return this.safeUser(user);
  }
}
