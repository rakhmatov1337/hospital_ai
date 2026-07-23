import { Module } from '@nestjs/common';
import { CheckinsService } from './checkins.service';

@Module({
  providers: [CheckinsService],
  exports: [CheckinsService],
})
export class CheckinsModule {}
