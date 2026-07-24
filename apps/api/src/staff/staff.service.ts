import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Staff } from '@prisma/client';
import { ERROR_CODES, StaffAccount, StaffRole } from '@hospital-ai/shared-types';
import { AppError } from '../common/errors';
import { RequestContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';

const BCRYPT_ROUNDS = 10;

/**
 * Staff-account administration (D7). All reads are clinic-scoped through the
 * tenancy client so one clinic can never see another's staff. Creating and
 * updating accounts is restricted to a `clinical_lead` (account management is a
 * governance action). The password hash is never returned.
 */
@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
  ) {}

  /** List the authenticated clinic's staff accounts. */
  async list(): Promise<StaffAccount[]> {
    const clinicId = this.ctx.requireClinicId();
    const scoped = this.prisma.forClinic(clinicId) as unknown as PrismaService;
    const rows = await scoped.staff.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map(toAccount);
  }

  /** Create a staff account in the authenticated clinic (clinical_lead only). */
  async create(dto: CreateStaffDto): Promise<StaffAccount> {
    const clinicId = this.ctx.requireClinicId();
    this.ctx.requireClinicalLead();

    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.staff.findUnique({ where: { email } });
    if (existing) {
      throw new AppError(
        ERROR_CODES.DUPLICATE_REQUEST,
        'A staff account with this email already exists.',
        { email },
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const created = await this.prisma.staff.create({
      data: {
        clinicId,
        name: dto.name,
        email,
        passwordHash,
        role: dto.role,
        active: true,
      },
    });
    return toAccount(created);
  }

  /** Update a staff account in the authenticated clinic (clinical_lead only). */
  async update(id: string, dto: UpdateStaffDto): Promise<StaffAccount> {
    const clinicId = this.ctx.requireClinicId();
    this.ctx.requireClinicalLead();

    const staff = await this.prisma.staff.findUnique({ where: { id } });
    if (!staff) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Staff account not found.', { id });
    }
    if (staff.clinicId !== clinicId) {
      throw new AppError(
        ERROR_CODES.CROSS_CLINIC_FORBIDDEN,
        'This staff account belongs to another clinic.',
      );
    }

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.password !== undefined) {
      data.passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    }

    const updated = await this.prisma.staff.update({ where: { id }, data });
    return toAccount(updated);
  }
}

/** Project a Staff row to the public account shape (never the password hash). */
function toAccount(staff: Staff): StaffAccount {
  return {
    id: staff.id,
    name: staff.name,
    email: staff.email,
    role: staff.role as StaffRole,
    active: staff.active,
    createdAt: staff.createdAt.toISOString(),
  };
}
