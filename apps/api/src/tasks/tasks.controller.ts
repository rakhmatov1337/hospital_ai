import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Audience, PatientJwtGuard } from '../auth/guards';
import { RequestContext } from '../common/request-context';
import { ERROR_CODES } from '@hospital-ai/shared-types';
import { AppError } from '../common/errors';
import { TasksService } from './tasks.service';

/**
 * Patient-facing task API (the Today screen completes tasks through it). Requires
 * an `aud:"patient"` token; completion is scoped to the caller's own patient
 * (from RequestContext, never the request) so a patient can never complete
 * another patient's task.
 */
@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
@Audience('patient')
@UseGuards(PatientJwtGuard)
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly ctx: RequestContext,
  ) {}

  /**
   * Complete a task. The `Idempotency-Key` header is REQUIRED (design spec §8) —
   * offline sync retries carry the same key and must produce a single effect. The
   * task must belong to the authenticated patient (else NOT_FOUND).
   */
  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete one of your own tasks (idempotent on Idempotency-Key).' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async complete(
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    const patientId = this.ctx.patientId;
    if (!patientId) {
      throw new AppError(
        ERROR_CODES.UNAUTHORIZED,
        'A patient token is required to complete a task.',
      );
    }
    return this.tasksService.complete(id, idempotencyKey, patientId);
  }
}
