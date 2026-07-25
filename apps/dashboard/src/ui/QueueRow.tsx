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
 * Queue row (spec §2) — a scannable card: a left accent bar for the SLA state,
 * patient name + recovery day, a PROMINENT live elapsed counter (the triage
 * metric), and the tier + status. Min height 64.
 *
 * SLA visuals (based on unacknowledged age, NOT the row tier):
 *   ≥ urgentAfterMinutes  → amber accent + amber timer
 *   ≥ breachAfterMinutes  → red accent + red timer + Breached status
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

  const accentClass = breached
    ? 'bg-tier-emergency'
    : urgentFlag
      ? 'bg-tier-urgent'
      : 'bg-border';
  const timerClass = breached
    ? 'text-tier-emergency'
    : urgentFlag
      ? 'text-tier-urgent'
      : 'text-text';

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
        'group flex min-h-row cursor-pointer items-stretch gap-3 overflow-hidden rounded-input border border-border bg-card shadow-card',
        'outline-none transition-colors hover:border-primary/30 hover:bg-primary/[0.03]',
        'focus-visible:ring-2 focus-visible:ring-primary',
        isTest && 'border-dashed opacity-60',
      )}
    >
      {/* SLA accent bar */}
      <span aria-hidden="true" className={cn('w-1 shrink-0 rounded-full', accentClass)} />

      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5 pr-4">
        {/* Patient + meta */}
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="truncate text-body font-semibold text-text">{patientName}</span>
            {isTest && (
              <span className="shrink-0 rounded-input border border-border px-1.5 py-0.5 text-[0.7rem] font-semibold uppercase text-text-muted">
                {t('queueRow.testTag', { defaultValue: '[TEST]' })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-caption text-text-muted">
            <span>{t('queueRow.day', { defaultValue: 'Day {{n}}', n: recoveryDay })}</span>
            <span aria-hidden="true">·</span>
            <span>
              {t('queueRow.submitted', { defaultValue: 'Submitted {{time}}', time: submittedTime })}
            </span>
          </div>
        </div>

        {/* Elapsed metric + tier/status */}
        <div className="flex shrink-0 items-center gap-4">
          <div className="text-right">
            <div className={cn('text-body font-semibold tabular-nums leading-tight', timerClass)}>
              {formatElapsed(submittedAt, now)}
            </div>
            <div className="text-[0.7rem] uppercase tracking-wide text-text-muted">
              {t('queueRow.elapsedLabel', { defaultValue: 'Elapsed' })}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <TierBadge tier={tier} size="sm" />
            <StatusChip status={breached ? EscalationStatus.breached : status} />
          </div>
        </div>
      </div>
    </div>
  );
}
