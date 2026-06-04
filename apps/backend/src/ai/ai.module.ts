import { Module } from '@nestjs/common';
import { ChatController } from './chat/chat.controller';
import { CarePlanController } from './care-plan/care-plan.controller';
import { RiskController } from './risk/risk.controller';

@Module({
  controllers: [ChatController, CarePlanController, RiskController],
})
export class AiModule {}
