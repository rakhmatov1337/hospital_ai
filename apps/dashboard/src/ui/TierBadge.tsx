import { useTranslation } from 'react-i18next';
import { Tier } from '@hospital-ai/shared-types';
import { cn } from '../lib/cn';
import { TIER_META } from './tier';

export interface TierBadgeProps {
  tier: Tier;
  /** 'solid' = filled tier colour with white text; 'soft' = tinted outline. */
  variant?: 'solid' | 'soft';
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Tier indicator — ALWAYS icon + text label + colour (never colour alone).
 * The label is translated (common:tier.<tier>) with an English fallback.
 */
export function TierBadge({ tier, variant = 'soft', size = 'md', className }: TierBadgeProps) {
  const { t } = useTranslation('common');
  const meta = TIER_META[tier];
  const label = t(`tier.${tier}`, { defaultValue: meta.defaultLabel });

  return (
    <span
      data-tier={tier}
      role="status"
      aria-label={label}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-input font-semibold',
        size === 'sm' ? 'px-2 py-0.5 text-caption' : 'px-3 py-1 text-body',
        variant === 'solid'
          ? cn(meta.bgClass, 'text-white')
          : cn('border bg-surface', meta.textClass, meta.borderClass),
        className,
      )}
    >
      <span aria-hidden="true">{meta.icon}</span>
      <span>{label}</span>
    </span>
  );
}
