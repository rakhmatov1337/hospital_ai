import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ERROR_CODES, StaffRole, TokenAudience } from '@hospital-ai/shared-types';
import { AppError } from '../common/errors';
import { JwtTokenService } from './jwt';

/** Metadata key for the per-route required token audience. */
export const AUDIENCE_KEY = 'auth:audience';

/**
 * Declare the token audience a route (or controller) requires. A generic
 * JWT guard reads this; the concrete StaffJwtGuard/PatientJwtGuard also honour
 * it as an override of their default.
 *
 *   @Audience('staff')
 *   @UseGuards(StaffJwtGuard)
 */
export const Audience = (audience: TokenAudience): MethodDecorator & ClassDecorator =>
  SetMetadata(AUDIENCE_KEY, audience);

/** Verified principal attached to the request by the guard. */
export interface AuthPrincipal {
  audience: TokenAudience;
  clinicId: string;
  staffId?: string;
  patientId?: string;
  role?: StaffRole;
}

/** Express request augmented with the verified principal. */
export interface AuthenticatedRequest extends Request {
  authPrincipal?: AuthPrincipal;
}

function extractBearer(req: Request): string | undefined {
  const header = req.headers['authorization'];
  if (typeof header !== 'string') return undefined;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return undefined;
  return token.trim();
}

/**
 * Base guard: extracts the Bearer token, verifies it against the required
 * audience (from @Audience() metadata, else the guard's default), and attaches
 * the verified principal to the request. A cls-populating interceptor
 * (AuthContextInterceptor) later lifts this principal into RequestContext.
 *
 * A patient token at a staff route (or vice versa) throws WRONG_TOKEN_AUDIENCE
 * (403); a missing/invalid token throws UNAUTHORIZED (401).
 */
export abstract class BaseJwtGuard implements CanActivate {
  protected abstract readonly defaultAudience: TokenAudience;

  constructor(
    protected readonly jwt: JwtTokenService,
    protected readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required =
      this.reflector.getAllAndOverride<TokenAudience>(AUDIENCE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? this.defaultAudience;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearer(req);
    if (!token) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Missing bearer token.');
    }

    const claims = this.jwt.verify(token, required);

    req.authPrincipal = {
      audience: claims.aud,
      clinicId: claims.clinic_id,
      staffId: claims.aud === 'staff' ? claims.sub : undefined,
      patientId: claims.aud === 'patient' ? claims.sub : undefined,
      role: claims.role,
    };

    return true;
  }
}

/** Requires an `aud:"staff"` token. */
@Injectable()
export class StaffJwtGuard extends BaseJwtGuard {
  protected readonly defaultAudience: TokenAudience = 'staff';

  constructor(jwt: JwtTokenService, reflector: Reflector) {
    super(jwt, reflector);
  }
}

/** Requires an `aud:"patient"` token. */
@Injectable()
export class PatientJwtGuard extends BaseJwtGuard {
  protected readonly defaultAudience: TokenAudience = 'patient';

  constructor(jwt: JwtTokenService, reflector: Reflector) {
    super(jwt, reflector);
  }
}
