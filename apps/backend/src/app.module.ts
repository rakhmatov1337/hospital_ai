import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { typeOrmConfig } from './config/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { SurgeryTypesModule } from './surgery-types/surgery-types.module';
import { PatientsModule } from './patients/patients.module';
import { CarePlansModule } from './care-plans/care-plans.module';
import { CheckInsModule } from './check-ins/check-ins.module';
import { AlertsModule } from './alerts/alerts.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(typeOrmConfig()),
    AuthModule,
    SurgeryTypesModule,
    PatientsModule,
    CarePlansModule,
    CheckInsModule,
    AlertsModule,
    AiModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
