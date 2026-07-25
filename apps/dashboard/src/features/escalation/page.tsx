import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { Button, EmptyState, Spinner, TierBadge } from '../../ui';
import { Tier } from '@hospital-ai/shared-types';
import type { DashboardLanguage } from '../../lib/i18n';
import { errorCodeOf } from '../../lib/api-client';
import { useEscalationDetail } from './api';
import { PatientPanel } from './PatientPanel';
import { AnswersPanel } from './AnswersPanel';
import { TimelinePanel } from './TimelinePanel';
import { HistoryPanel } from './HistoryPanel';
import { ActionPanel } from './ActionPanel';

/**
 * D3 — Escalation detail. Patient, verbatim check-in answers, deciding rule +
 * version, notification/status timeline, recent history, and the two forward-only
 * actions. Nothing here edits, deletes, or dismisses an escalation.
 */
export function EscalationDetailPage() {
  const { t, i18n } = useTranslation('escalation');
  const lang: DashboardLanguage = i18n.language.startsWith('ru')
    ? 'ru'
    : i18n.language.startsWith('uz')
      ? 'uz'
      : 'en';
  const { id = '' } = useParams<{ id: string }>();
  const { data, isLoading, isError, error, refetch } = useEscalationDetail(id);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link
          to="/queue"
          className="text-body font-semibold text-primary hover:underline"
        >
          ← {t('backToQueue')}
        </Link>
      </div>

      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner size="lg" label={t('loading')} />
        </div>
      )}

      {isError && !isLoading && (
        <EmptyState
          title={t('loadError.title')}
          description={t(`errors.${errorCodeOf(error)}`, { defaultValue: t('errors.default') })}
          action={
            <Button variant="secondary" onClick={() => void refetch()}>
              {t('loadError.retry')}
            </Button>
          }
        />
      )}

      {data && !isLoading && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-display font-bold text-text">{t('title')}</h1>
            <TierBadge tier={data.tier as Tier} variant="solid" />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="flex flex-col gap-6 lg:col-span-2">
              <PatientPanel patient={data.patient} lang={lang} />
              <AnswersPanel answers={data.answers} />
              <TimelinePanel detail={data} lang={lang} />
            </div>
            <div className="flex flex-col gap-6">
              <ActionPanel detail={data} />
              <HistoryPanel
                recentCheckIns={data.recentCheckIns}
                adherence={data.adherence}
                lang={lang}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
