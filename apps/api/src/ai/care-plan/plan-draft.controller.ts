import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Audience, StaffJwtGuard } from '../../auth/guards';
import { RequestContext } from '../../common/request-context';
import { DraftPlanDto } from './dto/draft-plan.dto';
import { PlanDraftService } from './plan-draft.service';

/**
 * Clinician-side AI surface. STAFF ONLY (clinical_lead) — there is deliberately
 * no patient-facing AI endpoint anywhere in this API.
 *
 * The response is a DRAFT recovery-plan template made of approved content KEYS
 * for a clinician to review and approve. It is never persisted as a live plan
 * and never reaches a patient response (QA gate Layer-1 A2).
 */
@ApiTags('ai')
@ApiBearerAuth()
@Controller('plans')
@Audience('staff')
@UseGuards(StaffJwtGuard)
export class PlanDraftController {
  constructor(
    private readonly planDraft: PlanDraftService,
    private readonly ctx: RequestContext,
  ) {}

  @Post('ai-draft')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Draft a recovery-plan template by SELECTING approved content (clinical_lead only). ' +
      'Returns a DRAFT for clinician approval — the AI selects keys, it never composes patient text.',
  })
  async draft(@Body() dto: DraftPlanDto) {
    this.ctx.requireClinicalLead();
    return this.planDraft.draft(dto.procedureType);
  }
}
