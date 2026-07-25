import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Banner, Button, Card, ConnectionStatus, EmptyState, Spinner } from '../../ui';
import { apiClient } from '../../lib/api-client';
import type { ClinicView } from '../../lib/api-types';
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
  // The shell owns the audible chime app-wide; here we only surface the visual banner.
  const alert = useNewArrivalAlert(data, filter, { playSound: false });

  // Clinic-configured escalation thresholds drive the breach/urgent visuals; the
  // clinic is shared-cache with the shell (['clinics','me']).
  const clinic = useQuery({
    queryKey: ['clinics', 'me'],
    queryFn: () => apiClient.get<ClinicView>('/clinics/me'),
    staleTime: 5 * 60_000,
  });

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

        <Card
          role="group"
          aria-label={t('filter.label', { defaultValue: 'Show' })}
          padded={false}
          className="inline-flex w-fit gap-1 p-1"
        >
          {FILTERS.map((value) => {
            const selected = filter === value;
            return (
              <Button
                key={value}
                variant="ghost"
                size="sm"
                aria-pressed={selected}
                onClick={() => setFilter(value)}
                className={cn(
                  selected
                    ? 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'
                    : 'text-text-muted',
                )}
              >
                {t(`filter.${value}`, { defaultValue: value })}
              </Button>
            );
          })}
        </Card>
      </header>

      {alert.active && (
        <Banner
          tone={alert.arrivedTier === 'emergency' ? 'danger' : 'warning'}
          title={
            alert.arrivedTier === 'emergency'
              ? t('newArrival.emergencyTitle', { defaultValue: 'New EMERGENCY check-in' })
              : t('newArrival.title', { defaultValue: 'New urgent check-in' })
          }
          action={
            <Button variant="ghost" size="sm" onClick={alert.dismiss}>
              {t('newArrival.dismiss', { defaultValue: 'Dismiss' })}
            </Button>
          }
        >
          {alert.arrivedTier === 'emergency'
            ? t('newArrival.emergencyBody', {
                defaultValue: 'A new EMERGENCY check-in just arrived — review it first.',
              })
            : t('newArrival.body', {
                defaultValue: 'A new urgent check-in just arrived.',
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
          description={
            filter === 'all'
              ? t('empty.bodyAll', { defaultValue: 'There are no check-ins yet.' })
              : t('empty.body', { defaultValue: 'There are no unresolved check-ins right now.' })
          }
          footer={
            <ConnectionStatus
              isFetching={isFetching}
              isError={isError}
              lastUpdatedAt={dataUpdatedAt || null}
            />
          }
        />
      ) : (
        <QueueBoard
          data={data}
          urgentAfterMinutes={clinic.data?.ackMinutes}
          breachAfterMinutes={clinic.data?.breachMinutes}
          onRowClick={(id) => navigate(`/escalations/${id}`)}
        />
      )}
    </div>
  );
}
