import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { Patient } from '../entities/patient.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard, RolesGuard, TenantGuard } from './guards';
import { env } from '../config/env';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([User, Patient]),
    JwtModule.register({
      secret: env.jwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, RolesGuard, TenantGuard],
  exports: [JwtModule, JwtAuthGuard, RolesGuard, TenantGuard],
})
export class AuthModule {}
