import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { PlansModule } from '../plans/plans.module';
import { EnrolmentService } from './enrolment.service';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

/**
 * Patients + enrolment. Imports PlansModule for TaskGenerationService and the
 * config ConfigModule for the ProductionGateService that gates enrolment.
 * (ConfigModule is @Global, so this import also makes the gate available app-wide.)
 */
@Module({
  imports: [ConfigModule, PlansModule],
  controllers: [PatientsController],
  providers: [PatientsService, EnrolmentService],
  exports: [PatientsService, EnrolmentService],
})
export class PatientsModule {}
