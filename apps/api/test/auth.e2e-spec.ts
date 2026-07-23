import { generateKeyPairSync } from 'node:crypto';
import {
  Controller,
  Get,
  INestApplication,
  UseGuards,
} from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ClsModule } from 'nestjs-cls';
import request from 'supertest';
import { ERROR_CODES, StaffRole } from '@hospital-ai/shared-types';

import { AppExceptionFilter } from '../src/common/errors';
import { RequestContext } from '../src/common/request-context';
import { JwtTokenService } from '../src/auth/jwt';
import { StaffJwtGuard, PatientJwtGuard } from '../src/auth/guards';
import { AuthContextInterceptor } from '../src/auth/auth-context.interceptor';

// Minimal guarded routes exercising each audience.
@Controller('staff-only')
@UseGuards(StaffJwtGuard)
class StaffOnlyController {
  @Get()
  ping(): { ok: true } {
    return { ok: true };
  }
}

@Controller('patient-only')
@UseGuards(PatientJwtGuard)
class PatientOnlyController {
  @Get()
  ping(): { ok: true } {
    return { ok: true };
  }
}

const CLINIC_ID = '018f0000-0000-7000-8000-000000000001';
const STAFF_ID = '018f0000-0000-7000-8000-0000000000aa';
const PATIENT_ID = '018f0000-0000-7000-8000-0000000000bb';

describe('Auth — two-audience guards (e2e)', () => {
  let app: INestApplication;
  let jwt: JwtTokenService;

  beforeAll(async () => {
    // Self-contained RS256 keypair so the suite does not depend on .env keys.
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    process.env.JWT_PRIVATE_KEY = privateKey;
    process.env.JWT_PUBLIC_KEY = publicKey;

    const moduleRef = await Test.createTestingModule({
      imports: [ClsModule.forRoot({ global: true, middleware: { mount: true } })],
      controllers: [StaffOnlyController, PatientOnlyController],
      providers: [
        JwtTokenService,
        StaffJwtGuard,
        PatientJwtGuard,
        RequestContext,
        { provide: APP_INTERCEPTOR, useClass: AuthContextInterceptor },
        { provide: APP_FILTER, useClass: AppExceptionFilter },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    jwt = moduleRef.get(JwtTokenService);
  });

  afterAll(async () => {
    await app?.close();
  });

  const staffToken = (): string =>
    jwt.signStaffAccess(STAFF_ID, CLINIC_ID, StaffRole.staff);
  const patientToken = (): string => jwt.signPatientAccess(PATIENT_ID, CLINIC_ID);

  it('rejects a patient token at a staff route with 403 WRONG_TOKEN_AUDIENCE', async () => {
    const res = await request(app.getHttpServer())
      .get('/staff-only')
      .set('Authorization', `Bearer ${patientToken()}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe(ERROR_CODES.WRONG_TOKEN_AUDIENCE);
  });

  it('rejects a staff token at a patient route with 403 WRONG_TOKEN_AUDIENCE', async () => {
    const res = await request(app.getHttpServer())
      .get('/patient-only')
      .set('Authorization', `Bearer ${staffToken()}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe(ERROR_CODES.WRONG_TOKEN_AUDIENCE);
  });

  it('rejects a missing token with 401 UNAUTHORIZED', async () => {
    const res = await request(app.getHttpServer()).get('/staff-only');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe(ERROR_CODES.UNAUTHORIZED);
  });

  it('accepts a correctly-audienced token', async () => {
    const staff = await request(app.getHttpServer())
      .get('/staff-only')
      .set('Authorization', `Bearer ${staffToken()}`);
    expect(staff.status).toBe(200);
    expect(staff.body).toEqual({ ok: true });

    const patient = await request(app.getHttpServer())
      .get('/patient-only')
      .set('Authorization', `Bearer ${patientToken()}`);
    expect(patient.status).toBe(200);
    expect(patient.body).toEqual({ ok: true });
  });
});
