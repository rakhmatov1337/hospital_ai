import { Global, Module } from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';

/**
 * Telemetry + metrics. TelemetryService is the @Global append-only Event writer
 * every domain flow emits through; MetricsService is the read-only reverse — it
 * derives the pilot metrics from the Event stream + domain tables and is exposed at
 * GET /v1/metrics (staff-only) via MetricsController.
 */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [TelemetryService, MetricsService],
  exports: [TelemetryService, MetricsService],
})
export class TelemetryModule {}
