/**
 * The escalation NotificationChannel contract (SP2 spec §5).
 *
 * A channel places ONE escalation heads-up to a staff role. The request shape is
 * the safety boundary: it carries **zero clinical detail** — only the escalation
 * id, the anonymised patient reference, the target role, and the attempt number.
 * A patient's symptoms, tier, check-in answers, or any free text can NEVER reach
 * a notification because they are not fields on {@link NotificationRequest}.
 *
 * The MVP adapter is {@link InDashboardNotificationChannel} (persist + log; a
 * human places the actual call). Automated telephony is a later adapter swap
 * behind this same interface — never a rewrite.
 */

/** The (deliberately minimal) payload a channel is handed. Zero clinical detail. */
export interface NotificationRequest {
  /** Which escalation this heads-up belongs to. */
  escalationId: string;
  /** Anonymised patient reference (never the internal patient_id, never a name). */
  patientRef: string;
  /** The staff role to alert: `on_duty` | `backup` | `clinic_head`. */
  recipientRole: string;
  /** 1-based ladder attempt number (1 = first notify, 2 = backup, 3 = head). */
  attemptNumber: number;
}

/** A channel's delivery result. */
export interface NotificationResult {
  /** True when the heads-up was placed/persisted (the record is appended either way). */
  delivered: boolean;
}

/**
 * Places a single escalation notification. Implementations MUST NOT accept or
 * forward any clinical detail beyond {@link NotificationRequest}.
 */
export interface NotificationChannel {
  send(request: NotificationRequest): Promise<NotificationResult>;
}

/** DI token for the active {@link NotificationChannel} implementation. */
export const NOTIFICATION_CHANNEL = Symbol('NOTIFICATION_CHANNEL');
