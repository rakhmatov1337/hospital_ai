import { useTranslation } from 'react-i18next';
import { Tier } from '@hospital-ai/shared-types';
import { Card, TierBadge } from '../../ui';
import type { DashboardLanguage } from '../../lib/i18n';
import type { EscalationDetail } from './api';
import { formatDateTime } from './format';

interface Step {
  key: string;
  title: string;
  detail?: string;
  time?: string;
  /** reached = event has happened; pending = future/not-yet. */
  reached: boolean;
  /** breached step is a terminal negative marker. */
  negative?: boolean;
}

/**
 * The deciding rule (tier + rule_version) plus the notification/status timeline:
 * submitted → notified (each attempt) → acknowledged → contacted. Timestamps come
 * straight from the api; steps with no recorded time show their state only.
 */
export function TimelinePanel({
  detail,
  lang,
}: {
  detail: EscalationDetail;
  lang: DashboardLanguage;
}) {
  const { t } = useTranslation('escalation');

  const acknowledged =
    detail.status === 'acknowledged' || detail.status === 'contacted';
  const contacted = detail.status === 'contacted';
  const breached = detail.status === 'breached';

  const steps: Step[] = [
    {
      key: 'submitted',
      title: t('timeline.submitted'),
      time: formatDateTime(detail.createdAt, lang),
      reached: true,
    },
    ...detail.notifications.map((n) => ({
      key: `notify-${n.attemptNumber}`,
      title: t('timeline.notified', {
        attempt: n.attemptNumber,
        role: t(`roles.${n.recipientRole}`, { defaultValue: n.recipientRole }),
      }),
      detail: t(n.delivered ? 'timeline.deliveredVia' : 'timeline.sentVia', {
        channel: t(`channels.${n.channel}`, { defaultValue: n.channel }),
      }),
      time: formatDateTime(n.sentAt, lang),
      reached: true,
    })),
  ];

  if (breached) {
    steps.push({
      key: 'breached',
      title: t('timeline.breached'),
      detail: t('timeline.breachedDetail'),
      reached: true,
      negative: true,
    });
  } else {
    steps.push({
      key: 'acknowledged',
      title: t('timeline.acknowledged'),
      reached: acknowledged,
    });
  }

  steps.push({
    key: 'contacted',
    title: t('timeline.contacted'),
    detail:
      contacted && detail.outcomeCode
        ? t(`outcomes.${detail.outcomeCode}`, { defaultValue: detail.outcomeCode })
        : undefined,
    reached: contacted,
  });

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-h2 font-semibold text-text">{t('timeline.title')}</h2>
        <div className="flex items-center gap-3">
          <TierBadge tier={detail.tier as Tier} variant="soft" size="sm" />
          <span className="text-caption text-text-muted">
            {t('timeline.ruleVersion', { version: detail.ruleVersion })}
          </span>
        </div>
      </div>

      <ol className="mt-4 space-y-0">
        {steps.map((s, i) => {
          const isLast = i === steps.length - 1;
          return (
            <li key={s.key} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  aria-hidden="true"
                  className={
                    'mt-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 ' +
                    (s.negative
                      ? 'border-tier-emergency bg-tier-emergency'
                      : s.reached
                        ? 'border-primary bg-primary'
                        : 'border-border bg-surface')
                  }
                />
                {!isLast && (
                  <span
                    aria-hidden="true"
                    className={
                      'w-0.5 flex-1 ' + (s.reached ? 'bg-primary' : 'bg-border')
                    }
                  />
                )}
              </div>
              <div className={'pb-5 ' + (isLast ? 'pb-0' : '')}>
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span
                    className={
                      'text-body font-semibold ' +
                      (s.negative
                        ? 'text-tier-emergency'
                        : s.reached
                          ? 'text-text'
                          : 'text-text-muted')
                    }
                  >
                    {s.title}
                  </span>
                  <span className="text-caption text-text-muted">
                    {s.reached ? t('timeline.reached') : t('timeline.pending')}
                  </span>
                </div>
                {s.detail && <p className="text-caption text-text-muted">{s.detail}</p>}
                {s.time && <p className="text-caption text-text-muted">{s.time}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
