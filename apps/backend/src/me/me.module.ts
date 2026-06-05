import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Patient } from '../entities/patient.entity';
import { CarePlan } from '../entities/care-plan.entity';
import { CarePlanItem } from '../entities/care-plan-item.entity';
import { ItemCompletion } from '../entities/item-completion.entity';
import { CheckIn } from '../entities/check-in.entity';
import { Complaint } from '../entities/complaint.entity';
import { MeService } from './me.service';
import { MeController } from './me.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Patient,
      CarePlan,
      CarePlanItem,
      ItemCompletion,
      CheckIn,
      Complaint,
    ]),
  ],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
