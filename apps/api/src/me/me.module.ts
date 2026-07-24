import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { MeController } from './me.controller';
import { MeService } from './me.service';

/**
 * Patient app ("me") module — the P1–P17 read/write surface (`/v1/me/*`,
 * `aud:"patient"`, patient-scoped). Reuses SP1/SP2 services: PrismaService,
 * RequestContext + Clock (global CommonModule), TelemetryService (global), and
 * ContentService (imported here) — no new domain model.
 */
@Module({
  imports: [ContentModule],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
