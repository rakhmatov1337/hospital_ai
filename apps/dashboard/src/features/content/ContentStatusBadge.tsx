import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { cn } from '../../lib/cn';

export type ContentBadgeStatus = 'approved' | 'needs_review' | 'draft' | 'missing';

/**
 * Content review-state badge. Always carries an icon + text label + colour (never
 * colour alone), per the accessibility rule. Uses only non-reserved palette colours
 * (success / primary / overdue-grey) — the tier colours are reserved for tiers.
 */
const STYLES: Record<ContentBadgeStatus, { box: string; icon: string }> = {
  approved: { box: 'bg-surface text-success border border-success', icon: '✓' },
  needs_review: { box: 'bg-primary/10 text-primary border border-primary', icon: '◐' },
  draft: { box: 'bg-background text-text-muted border border-border', icon: '✎' },
  missing: { box: 'bg-background text-overdue border border-border', icon: '—' },
};

export function ContentStatusBadge({
  status,
  className,
}: {
  status: ContentBadgeStatus;
  className?: string;
}) {
  const { t } = useTranslation('content');
  const style = STYLES[status];
  return (
    <Badge
      data-content-status={status}
      className={cn('gap-1 rounded-input text-caption font-semibold', style.box, className)}
    >
      <span aria-hidden="true">{style.icon}</span>
      {t(`reviewStatus.${status}`)}
    </Badge>
  );
}
