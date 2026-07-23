import { Module } from '@nestjs/common';
import { PlansService } from './plans.service';
import { TaskGenerationService } from './task-generation.service';

/**
 * Recovery-day engine (recovery-day.ts) and 30-day task generation
 * (task-generation.service.ts). TaskGenerationService is exported so the
 * enrolment flow (SP1 T6) can materialise a patient's task set.
 */
@Module({
  providers: [PlansService, TaskGenerationService],
  exports: [PlansService, TaskGenerationService],
})
export class PlansModule {}
