import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { Patient } from '../entities/patient.entity';
import { SurgeryType } from '../entities/surgery-type.entity';
import { CarePlan } from '../entities/care-plan.entity';
import { CarePlanItem } from '../entities/care-plan-item.entity';
import { CheckIn } from '../entities/check-in.entity';
import { PatientsService } from './patients.service';
import { PatientsController } from './patients.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Patient,
      SurgeryType,
      CarePlan,
      CarePlanItem,
      CheckIn,
    ]),
  ],
  controllers: [PatientsController],
  providers: [PatientsService],
})
export class PatientsModule {}
