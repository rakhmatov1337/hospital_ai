import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TasksService } from './tasks.service';

@ApiTags('tasks')
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  /**
   * Complete a task. The `Idempotency-Key` header is REQUIRED (design spec §8) —
   * offline sync retries carry the same key and must produce a single effect.
   */
  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete a task (idempotent on Idempotency-Key).' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async complete(
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.tasksService.complete(id, idempotencyKey);
  }
}
