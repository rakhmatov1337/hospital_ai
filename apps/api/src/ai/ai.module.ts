import { Module } from '@nestjs/common';
import { PlanDraftController } from './care-plan/plan-draft.controller';
import { PlanDraftService } from './care-plan/plan-draft.service';

/**
 * Clinician-side AI module (SP6).
 *
 * Contains ONLY the care-plan selection agent surface. There is no patient-facing
 * agent, no chat, and no model wired to any patient response — enforced by the
 * adversarial QA gate (`pnpm --filter api qa:gate`).
 */
@Module({
  controllers: [PlanDraftController],
  providers: [PlanDraftService],
  exports: [PlanDraftService],
})
export class AiModule {}
