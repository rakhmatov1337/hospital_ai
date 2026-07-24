import { useTranslation } from 'react-i18next';
import { EscalationStatus, Tier } from '@hospital-ai/shared-types';
import { cn } from '../lib/cn';
import { TierBadge } from './TierBadge';
import { StatusChip } from './StatusChip';
import { formatElapsed, minutesSince, useNow } from './use-elapsed';

export interface QueueRowProps {
  patientName: string;
  recoveryDay: number;
  submittedAt: string;
  status: EscalationStatus;
  tier: Tier;
  /** Ladder halted (acknowledged/contacted) → no breach escalation border. */
  acknowledged?: boolean;
  /** [TEST] rows render dashed + dimmed and are labelled. */
  isTest?: boolean;
  /** Unacknowledged age (min) that flags an urgent left border. Default 15. */
  urgentAfterMinutes?: number;
  /** Unacknowledged age (min) that flags a breach. Default 30. */
  breachAfterMinutes?: number;
  onClick?: () => void;
}

/**
 * Queue row (spec §2) — min height 64. Shows patient name (H2), recovery day,
 * submitted time, a LIVE elapsed counter, tier and status.
 *
 * Escalation-of-SLA visuals (based on unacknowledged age, NOT the row tier):
 *   ≥ urgentAfterMinutes  → urgent 4px left border
 *   ≥ breachAfterMinutes  → emergency 4px left border + BREACHED chip
 * Acknowledged rows never show these (the ladder is halted).
 */
export function QueueRow({
  patientName,
  recoveryDay,
  submittedAt,
  status,
  tier,
  acknowledged = false,
  isTest = false,
  urgentAfterMinutes = 15,
  breachAfterMinutes = 30,
  onClick,
}: QueueRowProps) {
  const { t } = useTranslation('common');
  const now = useNow(1000);
  const mins = acknowledged ? 0 : minutesSince(submittedAt, now);
  const breached = !acknowledged && mins >= breachAfterMinutes;
  const urgentFlag = !acknowledged && !breached && mins >= urgentAfterMinutes;

  const submittedTime = (() => {
    const d = new Date(submittedAt);
    return Number.isNaN(d.getTime())
      ? '—'
      : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  })();

  const borderClass = breached
    ? 'border-l-tier-emergency'
    : urgentFlag
      ? 'border-l-tier-urgent'
      : 'border-l-transparent';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={cn(
        'grid min-h-row cursor-pointer grid-cols-[1fr_auto] items-center gap-3 border border-l-4 border-border bg-surface px-4 py-2',
        'rounded-input outline-none transition-colors hover:bg-primary-light/40',
        'focus-visible:ring-2 focus-visible:ring-primary',
        borderClass,
        isTest && 'border-dashed opacity-60',
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-h2 font-semibold text-text">{patientName}</span>
          {isTest && (
            <span className="rounded-input border border-border px-1.5 py-0.5 text-caption font-semibold text-text-muted">
              {t('queueRow.testTag', { defaultValue: '[TEST]' })}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-text-muted">
          <span>{t('queueRow.day', { defaultValue: 'Day {{n}}', n: recoveryDay })}</span>
          <span>
            {t('queueRow.submitted', { defaultValue: 'Submitted {{time}}', time: submittedTime })}
          </span>
          <span
            className="font-semibold tabular-nums text-text"
            aria-label={t('queueRow.elapsedLabel', { defaultValue: 'Elapsed time' })}
          >
            {formatElapsed(submittedAt, now)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <TierBadge tier={tier} size="sm" />
        {breached && (
          <span className="inline-flex items-center rounded-input bg-tier-emergency px-2.5 py-0.5 text-caption font-semibold text-white">
            {t('queueRow.breached', { defaultValue: 'BREACHED' })}
          </span>
        )}
        <StatusChip status={breached ? EscalationStatus.breached : status} />
      </div>
    </div>
  );
}
