import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { Patient } from '../entities/patient.entity';
import { SurgeryType } from '../entities/surgery-type.entity';
import { CarePlan } from '../entities/care-plan.entity';
import { CarePlanItem } from '../entities/care-plan-item.entity';
import { CheckIn } from '../entities/check-in.entity';
import { RiskAssessment } from '../entities/risk-assessment.entity';
import { RecoveryPoint } from '../entities/recovery-point.entity';
import { Alert } from '../entities/alert.entity';
import { PatientsService } from './patients.service';
import { DoctorService } from './doctor.service';
import { DoctorController } from './doctor.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Patient,
      SurgeryType,
      CarePlan,
      CarePlanItem,
      CheckIn,
      RiskAssessment,
      RecoveryPoint,
      Alert,
    ]),
  ],
  controllers: [DoctorController],
  providers: [PatientsService, DoctorService],
})
export class DoctorModule {}
