import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

/**
 * Patient Assistant module (SP7) — the grounded chat. Reuses the global
 * CommonModule (RequestContext + Clock), TelemetryService (global) and
 * ContentService (imported) to resolve the approved emergency / contact-clinic
 * content the guards surface. The Mastra agent is loaded lazily inside the
 * service, so this module adds no eager `@mastra/*` import.
 */
@Module({
  imports: [ContentModule],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
