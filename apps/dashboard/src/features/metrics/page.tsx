import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Banner,
  Button,
  Card,
  ConnectionStatus,
  EmptyState,
  MetricCard,
  Select,
  SelectItem,
  Spinner,
} from '../../ui';
import { rangeForPreset, useMetrics, type RangePresetId } from './api';
import { denomText, formatDuration, formatPct, formatScore } from './format';
import { downloadMetricsCsv } from './csv';
import {
  AdherenceTrendChart,
  EscalationTierChart,
  LanguageSplitChart,
  RetentionChart,
} from './charts';

const PRESETS: RangePresetId[] = ['all', 'last7', 'last14', 'last30'];
const TIER_KEYS = ['emergency', 'urgent', 'routine'] as const;

/** D6 — Metrics (live). Read-only pilot analytics; every percentage carries its denominator. */
export function MetricsPage() {
  const { t } = useTranslation(['metrics', 'common']);
  const [preset, setPreset] = useState<RangePresetId>('all');
  const range = useMemo(() => rangeForPreset(preset), [preset]);
  const query = useMetrics(range);
  const report = query.data;

  const tierLabels = useMemo<Record<string, string>>(
    () => Object.fromEntries(TIER_KEYS.map((k) => [k, t(`common:tier.${k}`, { defaultValue: k })])),
    [t],
  );

  return (
    <section className="flex flex-col gap-6" aria-label={t('metrics:title')}>
      {/* Header: title + range selector + export + connection status */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-h1 font-bold text-text">{t('metrics:title')}</h1>
          <p className="text-body text-text-muted">{t('metrics:subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label={t('metrics:range.label')}
            value={preset}
            onValueChange={(v) => setPreset(v as RangePresetId)}
            className="min-w-44"
          >
            {PRESETS.map((p) => (
              <SelectItem key={p} value={p}>
                {t(`metrics:range.${p}`)}
              </SelectItem>
            ))}
          </Select>
          <Button
            variant="secondary"
            onClick={() => report && downloadMetricsCsv(report)}
            disabled={!report}
          >
            {t('metrics:export')}
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <ConnectionStatus
          isFetching={query.isFetching}
          isError={query.isError}
          lastUpdatedAt={query.dataUpdatedAt || null}
        />
        <p className="text-caption text-text-muted">{t('metrics:note.noOutcome')}</p>
      </div>

      {/* Error (stale data may still be shown beneath) */}
      {query.isError && (
        <Banner
          tone="danger"
          title={t('metrics:error.title')}
          action={
            <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
              {t('metrics:error.retry')}
            </Button>
          }
        >
          {t('metrics:error.body')}
        </Banner>
      )}

      {/* First load */}
      {query.isLoading && !report && (
        <div className="flex justify-center py-16">
          <Spinner size="lg" label={t('common:loading')} />
        </div>
      )}

      {/* Empty state (no patients yet) */}
      {report && report.language.patientPopulation === 0 && (
        <EmptyState title={t('metrics:empty.title')} description={t('metrics:empty.body')} />
      )}

      {report && report.language.patientPopulation > 0 && (
        <MetricsBody report={report} tierLabels={tierLabels} />
      )}
    </section>
  );
}

function MetricsBody({
  report,
  tierLabels,
}: {
  report: NonNullable<ReturnType<typeof useMetrics>['data']>;
  tierLabels: Record<string, string>;
}) {
  const { t } = useTranslation('metrics');
  const opens = report.engagement.avgAppOpensPerPatientPerWeek;
  const esc = report.escalations;
  const sat = report.satisfaction;

  const retentionPoints = [
    { label: t('retention.d7'), d: report.retention.day7 },
    { label: t('retention.d14'), d: report.retention.day14 },
    { label: t('retention.d30'), d: report.retention.day30 },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Headline metric cards */}
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-input border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={t('cards.adherence')}
          value={formatPct(report.adherence.overall)}
          denominator={denomText(report.adherence.overall, t('units.tasksOnTime'))}
        />
        <MetricCard
          label={t('cards.checkinCompletion')}
          value={formatPct(report.checkInCompletion)}
          denominator={denomText(report.checkInCompletion, t('units.checkins'))}
        />
        <MetricCard
          label={t('cards.retentionD30')}
          value={formatPct(report.retention.day30)}
          denominator={denomText(report.retention.day30, t('units.reachedDay30'))}
        />
        <MetricCard
          label={t('cards.appOpens')}
          value={formatScore(opens)}
          denominator={t('units.acrossPatients', { count: opens.denominator })}
        />
      </div>

      {/* Escalation summary cards */}
      <div>
        <h2 className="mb-2 text-h2 font-semibold text-text">{t('sections.escalations')}</h2>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-input border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label={t('cards.escalationsTotal')}
            value={String(esc.total)}
            denominator={t('units.acrossPatients', { count: report.language.patientPopulation })}
          />
          <MetricCard
            label={t('cards.breaches')}
            value={String(esc.breachCount)}
            denominator={t('units.ofEscalations', { count: esc.total })}
          />
          <MetricCard
            label={t('cards.medianAck')}
            value={formatDuration(esc.timeToAcknowledge)}
            denominator={t('units.fromEscalations', {
              n: esc.timeToAcknowledge.denominator,
              total: esc.total,
            })}
          />
          <MetricCard
            label={t('cards.medianContact')}
            value={formatDuration(esc.timeToContact)}
            denominator={t('units.fromEscalations', {
              n: esc.timeToContact.denominator,
              total: esc.total,
            })}
          />
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <AdherenceTrendChart
            byRecoveryDay={report.adherence.byRecoveryDay}
            title={t('charts.adherenceTrend')}
            unit={t('units.tasks')}
          />
        </Card>
        <Card>
          <RetentionChart points={retentionPoints} title={t('charts.retention')} unit={t('units.patients')} />
        </Card>
        <Card>
          <EscalationTierChart
            countByTier={esc.countByTier}
            total={esc.total}
            title={t('charts.escalationsByTier')}
            unit={t('units.escalations')}
            tierLabels={tierLabels}
          />
        </Card>
        <Card>
          <LanguageSplitChart
            patientsByLanguage={report.language.patientsByLanguage}
            population={report.language.patientPopulation}
            title={t('charts.languageSplit')}
            unit={t('units.patients')}
          />
        </Card>
      </div>

      {/* Adherence per language (each with denominator) */}
      <Card>
        <h2 className="mb-3 text-h2 font-semibold text-text">{t('sections.adherenceByLanguage')}</h2>
        {Object.keys(report.language.adherenceByLanguage).length === 0 ? (
          <p className="text-body text-text-muted">{t('empty.body')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {Object.entries(report.language.adherenceByLanguage).map(([lang, d]) => (
              <li key={lang} className="flex items-baseline justify-between gap-4 border-b border-border pb-2 last:border-0">
                <span className="text-body font-semibold uppercase text-text">{lang}</span>
                <span className="flex items-baseline gap-2">
                  <span className="text-h2 font-semibold text-text tabular-nums">{formatPct(d)}</span>
                  <span className="text-caption text-text-muted">{denomText(d, t('units.tasksOnTime'))}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Satisfaction (day-30 survey; 1–5 scale, each with its response count) */}
      <div>
        <h2 className="mb-2 text-h2 font-semibold text-text">
          {t('sections.satisfaction')}{' '}
          <span className="text-caption font-normal text-text-muted">
            {t('units.responses', { count: sat.responseCount })}
          </span>
        </h2>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-input border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
          {(
            [
              ['q1Helpful', sat.q1Helpful],
              ['q2Easy', sat.q2Easy],
              ['q3AdherenceSupport', sat.q3AdherenceSupport],
              ['q4Recommend', sat.q4Recommend],
            ] as const
          ).map(([key, item]) => (
            <MetricCard
              key={key}
              label={t(`satisfaction.${key}`)}
              value={`${formatScore(item)} / 5`}
              denominator={t('units.responseCount', { count: item.denominator })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
