import { useTranslation } from 'react-i18next';
import { Tier } from '@hospital-ai/shared-types';
import { Card, TierBadge } from '../../ui';
import { Badge } from '@/components/ui/badge';
import type { DashboardLanguage } from '../../lib/i18n';
import type { AdherenceSnapshot, RecentCheckIn } from './api';
import { adherencePercent, formatDateTime } from './format';

/** Recent history: last 5 check-ins + the adherence snapshot (with denominator). */
export function HistoryPanel({
  recentCheckIns,
  adherence,
  lang,
}: {
  recentCheckIns: RecentCheckIn[];
  adherence: AdherenceSnapshot;
  lang: DashboardLanguage;
}) {
  const { t } = useTranslation('escalation');
  const percent = adherencePercent(adherence.ratio);

  return (
    <Card>
      <h2 className="text-h2 font-semibold text-text">{t('history.title')}</h2>

      {/* Adherence — always show the denominator (spec §2). */}
      <div className="mt-3 rounded-input bg-background p-4">
        <p className="text-caption text-text-muted">{t('history.adherence')}</p>
        {percent === null ? (
          <p className="text-body text-text-muted">{t('history.adherenceNoData')}</p>
        ) : (
          <p className="text-body text-text">
            <span className="text-h2 font-bold">{percent}</span>{' '}
            <span className="text-text-muted">
              {t('history.adherenceDenominator', {
                completed: adherence.completedOnTime,
                total: adherence.assignedWindowClosed,
              })}
            </span>
          </p>
        )}
      </div>

      <h3 className="mt-4 text-caption font-semibold text-text-muted">
        {t('history.recentCheckIns')}
      </h3>
      {recentCheckIns.length === 0 ? (
        <p className="mt-2 text-body text-text-muted">{t('history.empty')}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {recentCheckIns.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
              <div>
                <p className="text-body text-text">
                  {t('patient.dayValue', { n: c.recoveryDay })}
                </p>
                <p className="text-caption text-text-muted">
                  {formatDateTime(c.submittedAt, lang)}
                </p>
              </div>
              {c.tier ? (
                <TierBadge tier={c.tier as Tier} variant="soft" size="sm" />
              ) : (
                <Badge variant="outline" className="text-text-muted">
                  {t('history.noTier')}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
