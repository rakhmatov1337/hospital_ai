import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Banner, Button, ConnectionStatus, EmptyState, Spinner } from '../../ui';
import { cn } from '../../lib/cn';
import { useEscalationQueue, type QueueFilter } from './api';
import { QueueBoard } from './QueueBoard';
import { useNewArrivalAlert } from './useNewArrivalAlert';

const FILTERS: readonly QueueFilter[] = ['unresolved', 'all'];

/**
 * D2 — Check-in queue (THE main screen). Three tier sections, live elapsed
 * counters + breach flags, auto-refresh every 30 s, an audible + visual alert on
 * a new urgent/emergency arrival, an explicit connection + last-updated readout,
 * and an All / Unresolved filter (Unresolved is the default). Nothing here may
 * reorder, collapse, paginate, or hide an unresolved urgent item.
 */
export function QueuePage() {
  const { t } = useTranslation(['queue', 'common']);
  const navigate = useNavigate();
  const [filter, setFilter] = useState<QueueFilter>('unresolved');

  const { data, isLoading, isFetching, isError, dataUpdatedAt, refetch } =
    useEscalationQueue(filter);
  const alert = useNewArrivalAlert(data, filter);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-h1 font-bold text-text">
              {t('title', { defaultValue: 'Check-in queue' })}
            </h1>
            <p className="text-body text-text-muted">
              {t('subtitle', { defaultValue: 'Live — auto-refreshes every 30 seconds' })}
            </p>
          </div>
          <ConnectionStatus
            isFetching={isFetching}
            isError={isError}
            lastUpdatedAt={dataUpdatedAt || null}
          />
        </div>

        <div
          role="group"
          aria-label={t('filter.label', { defaultValue: 'Show' })}
          className="inline-flex w-fit gap-1 rounded-input border border-border bg-surface p-1"
        >
          {FILTERS.map((value) => {
            const selected = filter === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                onClick={() => setFilter(value)}
                className={cn(
                  'rounded-input px-4 py-1.5 text-body font-semibold outline-none transition-colors',
                  'focus-visible:ring-2 focus-visible:ring-primary',
                  selected
                    ? 'bg-primary text-white'
                    : 'text-text-muted hover:bg-primary-light',
                )}
              >
                {t(`filter.${value}`, { defaultValue: value })}
              </button>
            );
          })}
        </div>
      </header>

      {alert.active && (
        <Banner
          tone="warning"
          title={t('newArrival.title', { defaultValue: 'New urgent check-in' })}
          action={
            <Button variant="ghost" size="sm" onClick={alert.dismiss}>
              {t('newArrival.dismiss', { defaultValue: 'Dismiss' })}
            </Button>
          }
        >
          {t('newArrival.body', {
            defaultValue: 'A new urgent or emergency check-in just arrived.',
          })}
        </Banner>
      )}

      {isError && (
        <Banner
          tone="danger"
          title={t('error.title', { defaultValue: "Couldn't refresh the queue" })}
          action={
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              {t('error.retry', { defaultValue: 'Retry' })}
            </Button>
          }
        >
          {t('error.body', {
            defaultValue: 'Showing the last data received. The connection will keep retrying.',
          })}
        </Banner>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('loading', { defaultValue: 'Loading queue…' })} />
        </div>
      ) : !data ? null : data.total === 0 ? (
        <EmptyState
          title={t('empty.title', { defaultValue: 'Nothing needs attention' })}
          description={t('empty.body', {
            defaultValue: 'There are no unresolved check-ins right now.',
          })}
          footer={
            <ConnectionStatus
              isFetching={isFetching}
              isError={isError}
              lastUpdatedAt={dataUpdatedAt || null}
            />
          }
        />
      ) : (
        <QueueBoard data={data} onRowClick={(id) => navigate(`/escalations/${id}`)} />
      )}
    </div>
  );
}
