import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtTokenService } from './jwt';
import { StaffJwtGuard, PatientJwtGuard } from './guards';
import { AuthContextInterceptor } from './auth-context.interceptor';

/**
 * Global so any feature module can `@UseGuards(StaffJwtGuard | PatientJwtGuard)`
 * and have JwtTokenService resolved without re-importing AuthModule.
 * The AuthContextInterceptor is registered app-wide to lift the guard's verified
 * principal into RequestContext.
 */
@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtTokenService,
    StaffJwtGuard,
    PatientJwtGuard,
    { provide: APP_INTERCEPTOR, useClass: AuthContextInterceptor },
  ],
  exports: [AuthService, JwtTokenService, StaffJwtGuard, PatientJwtGuard],
})
export class AuthModule {}
