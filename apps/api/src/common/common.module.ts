import { Global, Module } from '@nestjs/common';
import { RequestContext } from './request-context';
import { Clock, SystemClock } from './clock';

@Global()
@Module({
  providers: [RequestContext, { provide: Clock, useClass: SystemClock }],
  exports: [RequestContext, Clock],
})
export class CommonModule {}
