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
  acknowledged?: boolean;
  isTest?: boolean;
  urgentAfterMinutes?: number;
  breachAfterMinutes?: number;
  onClick?: () => void;
}

/**
 * Queue row — a full-width, table-style row: patient name, recovery day, submitted
 * time, a live elapsed counter, and tier + status spread across the width (no empty
 * middle). A thin left accent flags the SLA state (urgent/breach).
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
      : 'bg-transparent';
  const timerClass = breached ? 'text-tier-emergency' : urgentFlag ? 'text-tier-urgent' : 'text-text';

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
        'group relative grid min-h-row cursor-pointer items-center gap-x-6 px-5 py-3.5',
        'grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_6rem_9rem_minmax(11rem,auto)]',
        'outline-none transition-colors hover:bg-muted/50',
        'focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
        isTest && 'opacity-60',
      )}
    >
      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-[3px]', accentClass)} />

      {/* Patient */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-body font-semibold text-text">{patientName}</span>
          {isTest && (
            <span className="shrink-0 rounded-input border border-border px-1.5 py-0.5 text-[0.7rem] font-semibold uppercase text-text-muted">
              {t('queueRow.testTag', { defaultValue: '[TEST]' })}
            </span>
          )}
        </div>
        {/* Compact meta on small screens (columns are hidden below md). */}
        <div className="mt-0.5 flex items-center gap-2 text-caption text-text-muted md:hidden">
          <span>{t('queueRow.day', { defaultValue: 'Day {{n}}', n: recoveryDay })}</span>
          <span aria-hidden="true">·</span>
          <span className={cn('font-semibold tabular-nums', timerClass)}>
            {formatElapsed(submittedAt, now)}
          </span>
        </div>
      </div>

      {/* Recovery day */}
      <div className="hidden text-caption text-text-muted md:block">
        {t('queueRow.day', { defaultValue: 'Day {{n}}', n: recoveryDay })}
      </div>

      {/* Elapsed (with submitted time beneath) */}
      <div className="hidden md:block">
        <div className={cn('text-body font-semibold tabular-nums leading-tight', timerClass)}>
          {formatElapsed(submittedAt, now)}
        </div>
        <div className="text-[0.7rem] uppercase tracking-wide text-text-muted">
          {t('queueRow.submitted', { defaultValue: 'Submitted {{time}}', time: submittedTime })}
        </div>
      </div>

      {/* Tier + status */}
      <div className="flex items-center justify-end gap-2">
        <TierBadge tier={tier} size="sm" />
        <StatusChip status={breached ? EscalationStatus.breached : status} />
      </div>
    </div>
  );
}
