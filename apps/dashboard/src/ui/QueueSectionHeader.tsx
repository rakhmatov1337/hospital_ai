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
 * Queue section header — a coloured bar in the tier colour, white text, and a
 * count badge. Sections are always rendered Emergency → Urgent → Routine
 * (ordering is the queue screen's responsibility; see TIER_ORDER).
 */
export function QueueSectionHeader({ tier, count, className }: QueueSectionHeaderProps) {
  const { t } = useTranslation('common');
  const meta = TIER_META[tier];
  const label = t(`tier.${tier}`, { defaultValue: meta.defaultLabel });

  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-input px-4 py-2 text-white',
        meta.bgClass,
        className,
      )}
    >
      <span className="inline-flex items-center gap-2 text-h2 font-semibold">
        <span aria-hidden="true">{meta.icon}</span>
        <span>{label}</span>
      </span>
      <span
        aria-label={`${count}`}
        className="inline-flex min-w-[24px] items-center justify-center rounded-full bg-white/25 px-2 py-0.5 text-body font-semibold"
      >
        {count}
      </span>
    </div>
  );
}
