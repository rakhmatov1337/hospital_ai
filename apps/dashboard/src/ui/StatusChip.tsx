import { useTranslation } from 'react-i18next';
import { EscalationStatus } from '@hospital-ai/shared-types';
import { Badge } from '@/components/ui/badge';
import { cn } from '../lib/cn';

export interface StatusChipProps {
  status: EscalationStatus;
  className?: string;
}

/**
 * Escalation status chip (spec §2):
 *   New → primary-light bg · Acknowledged → success outline ·
 *   Contacted → success filled · Breached → emergency filled.
 * Text label is always present (never colour alone).
 */
const STATUS_STYLES: Record<EscalationStatus, string> = {
  [EscalationStatus.new]: 'bg-primary/10 text-primary border border-border',
  [EscalationStatus.acknowledged]: 'bg-surface text-success border border-success',
  [EscalationStatus.contacted]: 'bg-success text-white border border-success',
  [EscalationStatus.breached]: 'bg-tier-emergency text-white border border-tier-emergency',
};

const STATUS_DEFAULT_LABEL: Record<EscalationStatus, string> = {
  [EscalationStatus.new]: 'New',
  [EscalationStatus.acknowledged]: 'Acknowledged',
  [EscalationStatus.contacted]: 'Contacted',
  [EscalationStatus.breached]: 'Breached',
};

export function StatusChip({ status, className }: StatusChipProps) {
  const { t } = useTranslation('common');
  const label = t(`status.${status}`, { defaultValue: STATUS_DEFAULT_LABEL[status] });

  return (
    <Badge
      data-status={status}
      className={cn(
        STATUS_STYLES[status],
        'rounded-input px-2.5 py-0.5 text-caption font-semibold',
        className,
      )}
    >
      {label}
    </Badge>
  );
}
