import { useTranslation } from 'react-i18next';
import { PatientStatus } from '@hospital-ai/shared-types';
import { cn } from '../../lib/cn';

/**
 * Patient-status pill. Distinct from the escalation `StatusChip` (different enum).
 * Each status carries an icon + a text label + a colour — never colour alone.
 * `withdrawn` uses the neutral/overdue grey token, never red. `completed` uses the
 * reserved `success` token per the design system.
 */
const STATUS_STYLE: Record<PatientStatus, { box: string; icon: string }> = {
  [PatientStatus.enrolled]: { box: 'bg-primary-light text-primary-dark border-border', icon: '○' },
  [PatientStatus.active]: { box: 'bg-surface text-primary border-primary', icon: '▶' },
  [PatientStatus.completed]: { box: 'bg-success text-white border-success', icon: '✓' },
  [PatientStatus.withdrawn]: { box: 'bg-background text-text-muted border-border', icon: '⊘' },
};

export function PatientStatusBadge({ status }: { status: PatientStatus }) {
  const { t } = useTranslation('patients');
  const style = STATUS_STYLE[status];
  return (
    <span
      data-patient-status={status}
      className={cn(
        'inline-flex items-center gap-1 rounded-input border px-2.5 py-0.5 text-caption font-semibold',
        style.box,
      )}
    >
      <span aria-hidden="true">{style.icon}</span>
      {t(`patientStatus.${status}`)}
    </span>
  );
}

/**
 * Attention flag (adherence < 50% or no activity 3+ days — computed server-side).
 * Neutral, non-tier styling with a warning icon + text label so it reads clearly
 * without borrowing a reserved tier colour and without relying on colour alone.
 */
export function AttentionBadge() {
  const { t } = useTranslation('patients');
  return (
    <span
      data-attention="true"
      title={t('attention.aria')}
      className="inline-flex items-center gap-1 rounded-input border border-text-muted bg-surface px-2 py-0.5 text-caption font-semibold text-text"
    >
      <span aria-hidden="true">⚠</span>
      <span className="sr-only">{t('attention.aria')}</span>
      <span aria-hidden="true">{t('attention.label')}</span>
    </span>
  );
}
