import { Global, Module } from '@nestjs/common';
import { EnvConfig, loadEnvConfig } from './env.validation';
import { ProductionGateService } from './production-gate.service';

/**
 * Global config module: exposes the validated {@link EnvConfig} and the
 * {@link ProductionGateService} so any feature module (e.g. patient enrolment)
 * can inject the gate without importing this module explicitly.
 */
@Global()
@Module({
  providers: [
    {
      provide: EnvConfig,
      useFactory: (): EnvConfig => loadEnvConfig(),
    },
    ProductionGateService,
  ],
  exports: [EnvConfig, ProductionGateService],
})
export class ConfigModule {}
