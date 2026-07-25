import { useTranslation } from 'react-i18next';
import { Tier } from '@hospital-ai/shared-types';
import { cn } from '../lib/cn';
import { TIER_META } from './tier';

export interface QueueSectionHeaderProps {
  tier: Tier;
  count: number;
  className?: string;
}

/**
 * Queue section header — a quiet, editorial label: a small tier-coloured chip with
 * the tier icon, the tier name, and a count. The tier colour still reads instantly
 * (chip + icon) without a loud full-width bar. Sections render Emergency → Urgent →
 * Routine (ordering is the queue screen's responsibility; see TIER_ORDER).
 */
export function QueueSectionHeader({ tier, count, className }: QueueSectionHeaderProps) {
  const { t } = useTranslation('common');
  const meta = TIER_META[tier];
  const label = t(`tier.${tier}`, { defaultValue: meta.defaultLabel });

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span
        aria-hidden="true"
        className={cn(
          'flex size-5 items-center justify-center rounded-[5px] text-[0.7rem] leading-none text-white',
          meta.bgClass,
        )}
      >
        {meta.icon}
      </span>
      <span className="text-caption font-semibold uppercase tracking-wide text-text">{label}</span>
      <span aria-label={`${count}`} className="text-caption font-semibold text-text-muted">
        {count}
      </span>
      <span className="ml-1 h-px flex-1 bg-border" aria-hidden="true" />
    </div>
  );
}
