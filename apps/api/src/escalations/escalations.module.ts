import { Module } from '@nestjs/common';
import { EscalationsRepository } from './escalations.repository';

@Module({
  providers: [EscalationsRepository],
  exports: [EscalationsRepository],
})
export class EscalationsModule {}
