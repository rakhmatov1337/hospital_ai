import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ClsModule } from 'nestjs-cls';

import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AppExceptionFilter } from './common/errors';

import { AuthModule } from './auth/auth.module';
import { ClinicsModule } from './clinics/clinics.module';
import { StaffModule } from './staff/staff.module';
import { PatientsModule } from './patients/patients.module';
import { PlansModule } from './plans/plans.module';
import { TasksModule } from './tasks/tasks.module';
import { CheckinsModule } from './checkins/checkins.module';
import { EscalationsModule } from './escalations/escalations.module';
import { ContentModule } from './content/content.module';
import { TelemetryModule } from './telemetry/telemetry.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    // Deterministic scheduled jobs (escalation ladder, task_missed) — SP2.
    ScheduleModule.forRoot(),
    PrismaModule,
    CommonModule,
    // Feature modules (schema-backed skeletons in SP1 T1; behaviour in T2-T7).
    AuthModule,
    ClinicsModule,
    StaffModule,
    PatientsModule,
    PlansModule,
    TasksModule,
    CheckinsModule,
    EscalationsModule,
    ContentModule,
    TelemetryModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AppExceptionFilter }],
})
export class AppModule {}
