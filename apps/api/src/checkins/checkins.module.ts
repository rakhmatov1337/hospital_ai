import { Module } from '@nestjs/common';
import { EscalationsModule } from '../escalations/escalations.module';
import { ContentModule } from '../content/content.module';
import { CheckinsController } from './checkins.controller';
import { CheckinsService } from './checkins.service';

@Module({
  imports: [EscalationsModule, ContentModule],
  controllers: [CheckinsController],
  providers: [CheckinsService],
  exports: [CheckinsService],
})
export class CheckinsModule {}
