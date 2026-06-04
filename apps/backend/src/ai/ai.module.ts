import { Module } from '@nestjs/common';
import { ChatController } from './chat/chat.controller';

@Module({
  controllers: [ChatController],
})
export class AiModule {}
