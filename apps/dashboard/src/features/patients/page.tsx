import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { PatientListItem } from '@hospital-ai/shared-types';
import { Banner, Button, Card, DataTable, Spinner } from '../../ui';
import type { Column } from '../../ui';
import { errorCodeOf } from '../../lib/api-client';
import { usePatients } from './api';
import { filterPatients, PATIENT_FILTERS, type PatientFilter } from './filter';
import { AttentionBadge, PatientStatusBadge } from './badges';

/** D4 — Patient list. Enriched, filterable, sortable clinic roster. */
export function PatientsPage() {
  const { t, i18n } = useTranslation(['patients', 'errors', 'common']);
  const navigate = useNavigate();
  const [filter, setFilter] = useState<PatientFilter>('all');

  const { data, isLoading, isError, error, refetch, isFetching } = usePatients();

  const locale = i18n.resolvedLanguage === 'ru' ? 'ru-RU' : 'en-US';
  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }),
    [locale],
  );

  const formatDate = (iso: string): string => dateFmt.format(new Date(iso));
  const formatPercent = (value: number): string => `${Math.round(value * 100)}%`;

  const rows = useMemo(
    () => filterPatients(data ?? [], filter),
    [data, filter],
  );

  const columns: Array<Column<PatientListItem>> = [
    {
      key: 'name',
      header: t('patients:columns.name'),
      sortable: true,
      sortValue: (p) => p.name.toLowerCase(),
      render: (p) => (
        <div className="flex flex-col gap-1">
          <span className="text-h2 font-semibold text-text">{p.name}</span>
          {p.attentionFlag && <AttentionBadge />}
        </div>
      ),
    },
    {
      key: 'procedure',
      header: t('patients:columns.procedure'),
      sortable: true,
      sortValue: (p) => p.procedureType.toLowerCase(),
      render: (p) => <span className="text-text">{p.procedureType}</span>,
    },
    {
      key: 'discharge',
      header: t('patients:columns.discharge'),
      sortable: true,
      sortValue: (p) => p.dischargeDate,
      render: (p) => <span className="text-text-muted">{formatDate(p.dischargeDate)}</span>,
    },
    {
      key: 'recoveryDay',
      header: t('patients:columns.recoveryDay'),
      sortable: true,
      align: 'right',
      sortValue: (p) => p.recoveryDay,
      render: (p) => (
        <span className="tabular-nums text-text">{t('patients:cell.recoveryDay', { n: p.recoveryDay })}</span>
      ),
    },
    {
      key: 'adherence',
      header: t('patients:columns.adherence'),
      sortable: true,
      align: 'right',
      // null adherence sorts lowest (no data yet).
      sortValue: (p) => (p.adherence === null ? -1 : p.adherence),
      render: (p) =>
        p.adherence === null ? (
          <span className="text-text-muted">{t('patients:cell.adherenceNone')}</span>
        ) : (
          <div className="flex flex-col items-end">
            <span className="text-body font-semibold tabular-nums text-text">
              {formatPercent(p.adherence)}
            </span>
            <span className="text-caption tabular-nums text-text-muted">
              {t('patients:cell.adherenceFraction', {
                num: p.adherenceNumerator,
                den: p.adherenceDenominator,
              })}
            </span>
          </div>
        ),
    },
    {
      key: 'lastActive',
      header: t('patients:columns.lastActive'),
      sortable: true,
      sortValue: (p) => (p.lastActive ? new Date(p.lastActive).getTime() : 0),
      render: (p) =>
        p.lastActive ? (
          <span className="text-text-muted">{formatDate(p.lastActive)}</span>
        ) : (
          <span className="text-text-muted">{t('patients:cell.lastActiveNone')}</span>
        ),
    },
    {
      key: 'openEscalations',
      header: t('patients:columns.openEscalations'),
      sortable: true,
      align: 'right',
      sortValue: (p) => p.openEscalations,
      render: (p) =>
        p.openEscalations > 0 ? (
          <span className="inline-flex min-w-[1.75rem] items-center justify-center rounded-input border border-text-muted bg-surface px-2 py-0.5 text-caption font-semibold tabular-nums text-text">
            {p.openEscalations}
          </span>
        ) : (
          <span className="text-text-muted">{t('patients:cell.escalationsNone')}</span>
        ),
    },
    {
      key: 'status',
      header: t('patients:columns.status'),
      sortable: true,
      sortValue: (p) => p.status,
      render: (p) => <PatientStatusBadge status={p.status} />,
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-h1 font-bold text-text">{t('patients:title')}</h1>
          <p className="mt-1 text-body text-text-muted">{t('patients:subtitle')}</p>
        </div>
        <Button onClick={() => navigate('/patients/new')}>
          <span aria-hidden="true">+</span>
          {t('patients:addPatient')}
        </Button>
      </header>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div
          className="flex flex-wrap items-center gap-1"
          role="group"
          aria-label={t('patients:filter.label')}
        >
          {PATIENT_FILTERS.map((option) => {
            const active = filter === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(option)}
                className={
                  active
                    ? 'rounded-input bg-primary px-4 py-2 text-caption font-semibold text-white'
                    : 'rounded-input border border-border bg-surface px-4 py-2 text-caption font-semibold text-text-muted hover:bg-primary-light'
                }
              >
                {t(`patients:filter.${option}`)}
              </button>
            );
          })}
        </div>
        {!isLoading && !isError && (
          <p className="text-caption text-text-muted" aria-live="polite">
            {t('patients:count', { count: rows.length })}
            {isFetching && <Spinner size="sm" className="ml-2 align-middle" />}
          </p>
        )}
      </div>

      {isLoading ? (
        <Card className="flex items-center justify-center py-12">
          <Spinner size="lg" label={t('common:loading')} />
        </Card>
      ) : isError ? (
        <Banner
          tone="danger"
          title={t('patients:error.title')}
          action={
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              {t('patients:error.retry')}
            </Button>
          }
        >
          {t(`errors:${errorCodeOf(error)}`, { defaultValue: t('errors:default') })}
        </Banner>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(p) => p.id}
          onRowClick={(p) => navigate(`/patients/${p.id}`)}
          emptyTitle={t('patients:empty.title')}
          emptyDescription={
            filter === 'all' ? t('patients:empty.descriptionAll') : t('patients:empty.description')
          }
        />
      )}
    </div>
  );
}
