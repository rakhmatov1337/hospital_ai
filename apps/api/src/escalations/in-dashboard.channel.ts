import { Injectable, Logger } from '@nestjs/common';
import { Clock } from '../common/clock';
import { EscalationsRepository } from './escalations.repository';
import {
  NotificationChannel,
  NotificationRequest,
  NotificationResult,
} from './notification-channel';

/**
 * MVP notification channel (SP2 spec §5): **in-dashboard + logged**.
 *
 * It appends an append-only `EscalationNotification` row (the liability record —
 * failed attempts included) and logs a heads-up so a human places the actual
 * call from the dashboard. The persisted record and the log line both carry
 * **zero clinical detail**: only the role, the attempt number, and the
 * anonymised patient reference. The `EscalationNotification` row has no free-text
 * column, so a symptom can never be stored here even by mistake.
 *
 * Automated telephony is a future adapter behind {@link NotificationChannel} —
 * this class is swapped, never rewritten.
 */
@Injectable()
export class InDashboardNotificationChannel implements NotificationChannel {
  private readonly logger = new Logger('EscalationNotification');

  constructor(
    private readonly repo: EscalationsRepository,
    private readonly clock: Clock,
  ) {}

  async send(request: NotificationRequest): Promise<NotificationResult> {
    // Persist the attempt (append-only). `in_dashboard` is the delivery channel;
    // a staff member places the real call, so the heads-up is "delivered".
    await this.repo.appendNotification({
      escalationId: request.escalationId,
      attemptNumber: request.attemptNumber,
      channel: 'in_dashboard',
      recipientRole: request.recipientRole,
      sentAt: this.clock.now(),
      delivered: true,
    });

    // Log line carries ZERO clinical detail — patientRef + role + attempt only.
    this.logger.log(
      `Escalation ${request.escalationId}: notify ${request.recipientRole} ` +
        `(attempt ${request.attemptNumber}) for patient ${request.patientRef}`,
    );

    return { delivered: true };
  }
}
