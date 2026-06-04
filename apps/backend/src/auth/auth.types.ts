import { UserRole } from '../entities/user.entity';

export interface JwtPayload {
  sub: string; // user id
  role: UserRole;
  patientId?: string; // present for PATIENT tokens
}
