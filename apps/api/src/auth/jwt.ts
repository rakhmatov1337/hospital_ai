import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { ERROR_CODES, StaffRole, TokenAudience } from '@hospital-ai/shared-types';
import { AppError } from '../common/errors';

/**
 * Token lifetimes (design spec §4):
 *  - staff access: 8h (shared clinic computers, no long refresh).
 *  - patient access: 24h, patient refresh: 60d (covers the 30-day programme
 *    with margin so a patient is never logged out mid-recovery).
 */
const STAFF_ACCESS_TTL = '8h';
const PATIENT_ACCESS_TTL = '24h';
const PATIENT_REFRESH_TTL = '60d';

export type TokenType = 'access' | 'refresh';

/** Decoded, verified claims (payload + registered claims we rely on). */
export interface VerifiedTokenClaims {
  /** Subject: staffId (staff aud) or patientId (patient aud). */
  sub: string;
  aud: TokenAudience;
  clinic_id: string;
  type: TokenType;
  role?: StaffRole;
}

/**
 * Resolve a PEM key from either an inline env value (newlines may be escaped
 * as `\n`) or a file path. Inline wins when present.
 */
function resolveKey(
  inline: string | undefined,
  path: string | undefined,
  label: string,
): string {
  if (inline && inline.trim().length > 0) {
    return inline.replace(/\\n/g, '\n');
  }
  if (path && path.trim().length > 0) {
    const abs = isAbsolute(path) ? path : resolve(process.cwd(), path);
    return readFileSync(abs, 'utf8');
  }
  throw new Error(
    `${label} is not configured (set JWT_${label}_KEY inline PEM or JWT_${label}_KEY_PATH).`,
  );
}

/**
 * RS256 sign/verify for the two token audiences. Every token carries `aud`,
 * `clinic_id`, `sub`, `type` and `exp`; staff tokens also carry `role`.
 *
 * verify() distinguishes an audience mismatch (=> WRONG_TOKEN_AUDIENCE, 403)
 * from a signature/expiry failure (=> UNAUTHORIZED, 401) so a patient token at
 * a staff route returns 403 exactly as the negative test requires.
 */
@Injectable()
export class JwtTokenService {
  private readonly logger = new Logger(JwtTokenService.name);
  private readonly privateKey: string;
  private readonly publicKey: string;

  constructor() {
    this.privateKey = resolveKey(
      process.env.JWT_PRIVATE_KEY,
      process.env.JWT_PRIVATE_KEY_PATH,
      'PRIVATE',
    );
    this.publicKey = resolveKey(
      process.env.JWT_PUBLIC_KEY,
      process.env.JWT_PUBLIC_KEY_PATH,
      'PUBLIC',
    );
  }

  signStaffAccess(staffId: string, clinicId: string, role: StaffRole | string): string {
    return this.sign('staff', staffId, clinicId, 'access', STAFF_ACCESS_TTL, { role });
  }

  signPatientAccess(patientId: string, clinicId: string): string {
    return this.sign('patient', patientId, clinicId, 'access', PATIENT_ACCESS_TTL);
  }

  signPatientRefresh(patientId: string, clinicId: string): string {
    return this.sign('patient', patientId, clinicId, 'refresh', PATIENT_REFRESH_TTL);
  }

  private sign(
    audience: TokenAudience,
    subject: string,
    clinicId: string,
    type: TokenType,
    expiresIn: jwt.SignOptions['expiresIn'],
    extra: Record<string, unknown> = {},
  ): string {
    return jwt.sign({ clinic_id: clinicId, type, ...extra }, this.privateKey, {
      algorithm: 'RS256',
      audience,
      subject,
      expiresIn,
    });
  }

  /**
   * Verify signature + expiry, THEN assert the audience matches the route's
   * expectation. Signature/expiry problems are 401; a valid token of the wrong
   * audience is 403 WRONG_TOKEN_AUDIENCE.
   */
  verify(token: string, expectedAudience: TokenAudience): VerifiedTokenClaims {
    let decoded: jwt.JwtPayload;
    try {
      const raw = jwt.verify(token, this.publicKey, { algorithms: ['RS256'] });
      if (typeof raw === 'string') {
        throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Malformed token payload.');
      }
      decoded = raw;
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Invalid or expired token.');
    }

    const aud = normaliseAudience(decoded.aud);
    if (aud !== expectedAudience) {
      throw new AppError(
        ERROR_CODES.WRONG_TOKEN_AUDIENCE,
        'Token audience does not match this route.',
        { expected: expectedAudience, actual: aud ?? null },
      );
    }

    if (typeof decoded.sub !== 'string' || typeof decoded.clinic_id !== 'string') {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Token is missing required claims.');
    }

    return {
      sub: decoded.sub,
      aud,
      clinic_id: decoded.clinic_id,
      type: decoded.type === 'refresh' ? 'refresh' : 'access',
      role: typeof decoded.role === 'string' ? (decoded.role as StaffRole) : undefined,
    };
  }
}

function normaliseAudience(aud: jwt.JwtPayload['aud']): TokenAudience | undefined {
  const value = Array.isArray(aud) ? aud[0] : aud;
  if (value === 'staff' || value === 'patient') return value;
  return undefined;
}
