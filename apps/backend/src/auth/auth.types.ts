import { UserRole } from '../entities/user.entity';

export interface JwtPayload {
  sub: string; // user id
  role: UserRole;
  hospitalId?: string | null; // null for SUPERADMIN
  patientId?: string; // present for PATIENT tokens
}
