import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TaskMissedJob } from './task-missed.job';

@Module({
  controllers: [TasksController],
  providers: [TasksService, TaskMissedJob],
  exports: [TasksService],
})
export class TasksModule {}
