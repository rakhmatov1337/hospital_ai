import { Module } from '@nestjs/common';
import { EscalationsRepository } from './escalations.repository';
import { EscalationsService } from './escalations.service';
import { EscalationsController } from './escalations.controller';
import { EscalationLadderJob } from './ladder.job';
import { InDashboardNotificationChannel } from './in-dashboard.channel';
import { NOTIFICATION_CHANNEL } from './notification-channel';

/**
 * The escalation domain (SP2 Tasks 3 + 5): the append-only repository (SP1), the
 * deterministic ladder job + its notification channel, and the staff
 * queue/detail/actions API.
 *
 * The active {@link NotificationChannel} is bound to the MVP in-dashboard adapter
 * via the {@link NOTIFICATION_CHANNEL} token, so a future telephony adapter is a
 * one-line provider swap.
 */
@Module({
  controllers: [EscalationsController],
  providers: [
    EscalationsRepository,
    EscalationsService,
    EscalationLadderJob,
    InDashboardNotificationChannel,
    { provide: NOTIFICATION_CHANNEL, useExisting: InDashboardNotificationChannel },
  ],
  exports: [EscalationsRepository],
})
export class EscalationsModule {}
