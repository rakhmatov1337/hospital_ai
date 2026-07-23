import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { ERROR_CODES, TokenAudience } from '@hospital-ai/shared-types';
import { AppError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { JwtTokenService } from './jwt';

export interface StaffSession {
  audience: Extract<TokenAudience, 'staff'>;
  accessToken: string;
  staffId: string;
  clinicId: string;
  role: string;
}

export interface PatientSession {
  audience: Extract<TokenAudience, 'patient'>;
  accessToken: string;
  refreshToken: string;
  patientId: string;
  clinicId: string;
}

/**
 * Two-audience auth (design spec §4), RS256.
 *  - staffLogin(email, pw): bcrypt-verified; issues an 8h staff access token.
 *  - patientSession(code, phone): single-use 6-char enrolment code (14-day
 *    expiry); issues a 24h access + 60d refresh patient token.
 *
 * Failures are deliberately opaque (UNAUTHORIZED) so neither endpoint reveals
 * whether the identifier existed. Lookups use the base (unscoped) client because
 * login happens before any clinic is in request context; the token then carries
 * clinic_id so every subsequent request is tenancy-scoped.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtTokenService,
  ) {}

  async staffLogin(email: string, password: string): Promise<StaffSession> {
    const staff = await this.prisma.staff.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    const ok =
      staff !== null &&
      staff.active &&
      (await bcrypt.compare(password, staff.passwordHash));

    if (!staff || !ok) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Invalid email or password.');
    }

    return {
      audience: 'staff',
      accessToken: this.jwt.signStaffAccess(staff.id, staff.clinicId, staff.role),
      staffId: staff.id,
      clinicId: staff.clinicId,
      role: staff.role,
    };
  }

  async patientSession(code: string, phone: string): Promise<PatientSession> {
    const patient = await this.prisma.patient.findUnique({
      where: { enrolmentCode: code.toUpperCase().trim() },
    });

    const codeLive =
      patient !== null &&
      patient.codeExpiresAt !== null &&
      patient.codeExpiresAt.getTime() > Date.now();
    const phoneMatches = patient !== null && patient.phone === phone.trim();

    if (!patient || !codeLive || !phoneMatches) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Invalid enrolment code or phone.');
    }

    // Single-use: consume the code atomically. A concurrent replay finds
    // codeExpiresAt already null and fails codeLive above.
    const consumed = await this.prisma.patient.updateMany({
      where: { id: patient.id, codeExpiresAt: { not: null } },
      data: { codeExpiresAt: null, status: 'active' },
    });
    if (consumed.count === 0) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Enrolment code already used.');
    }

    return {
      audience: 'patient',
      accessToken: this.jwt.signPatientAccess(patient.id, patient.clinicId),
      refreshToken: this.jwt.signPatientRefresh(patient.id, patient.clinicId),
      patientId: patient.id,
      clinicId: patient.clinicId,
    };
  }
}
