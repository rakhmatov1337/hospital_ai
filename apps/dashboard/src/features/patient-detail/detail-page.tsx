import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PatientStatus, TaskStatus } from '@hospital-ai/shared-types';
import type {
  CheckInHistoryItem,
  EscalationHistoryItem,
  TaskHistoryItem,
} from '@hospital-ai/shared-types';
import {
  Banner,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  MetricCard,
  Spinner,
  StatusChip,
  TierBadge,
} from '../../ui';
import { cn } from '../../lib/cn';
import { errorCodeOf } from '../../lib/api-client';
import { AdherenceChart } from './AdherenceChart';
import { formatDate, formatDateTime, formatPercent } from './format';
import {
  usePatientDetail,
  useReissueCode,
  useWithdrawPatient,
} from './api';

/** D5 — Patient detail (view). Header, adherence chart, histories, consent, actions. */
export function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation(['patient-detail', 'common', 'errors']);
  const lang = i18n.resolvedLanguage ?? 'en';

  const query = usePatientDetail(id);
  const reissue = useReissueCode(id ?? '');
  const withdraw = useWithdrawPatient(id ?? '');

  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center p-6">
        <Spinner size="lg" label={t('common:loading')} />
      </div>
    );
  }

  if (query.isError || !query.data) {
    const code = errorCodeOf(query.error);
    return (
      <div className="p-2">
        <BackLink label={t('patient-detail:backToList')} />
        <Banner tone="danger" title={t('patient-detail:loadError')} className="mt-4">
          {t(`errors:${code}`, { defaultValue: t('errors:default') })}
        </Banner>
      </div>
    );
  }

  const p = query.data;
  const withdrawn = p.status === PatientStatus.withdrawn;
  const newCode = reissue.data?.enrolmentCode;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <BackLink label={t('patient-detail:backToList')} />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-display font-bold text-text">{p.name}</h1>
            <p className="text-body text-text-muted">
              {t('patient-detail:patientRef', { ref: p.patientRef })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <PatientStatusPill status={p.status} label={t(`patient-detail:patientStatus.${p.status}`)} />
            <Button
              variant="secondary"
              onClick={() => reissue.mutate()}
              disabled={withdrawn || reissue.isPending}
            >
              {reissue.isPending
                ? t('patient-detail:actions.reissuing')
                : t('patient-detail:actions.reissueCode')}
            </Button>
            <Button
              variant="danger"
              onClick={() => setConfirmWithdraw(true)}
              disabled={withdrawn || withdraw.isPending}
            >
              {t('patient-detail:actions.withdraw')}
            </Button>
          </div>
        </div>
      </div>

      {withdrawn && (
        <Banner tone="warning" title={t('patient-detail:withdrawnBanner.title')}>
          {t('patient-detail:withdrawnBanner.body')}
        </Banner>
      )}
      {p.attentionFlag && !withdrawn && (
        <Banner tone="warning" title={t('patient-detail:attentionBanner.title')}>
          {t('patient-detail:attentionBanner.body')}
        </Banner>
      )}
      {reissue.isError && (
        <Banner tone="danger" title={t('patient-detail:actions.reissueError')}>
          {t(`errors:${errorCodeOf(reissue.error)}`, { defaultValue: t('errors:default') })}
        </Banner>
      )}
      {newCode && (
        <Banner tone="success" title={t('patient-detail:actions.reissueDone')}>
          <span className="font-mono text-h2 font-bold tracking-[0.3em] text-text">{newCode}</span>
          <span className="ml-2 text-caption text-text-muted">
            {t('patient-detail:codeExpires', {
              date: formatDate(reissue.data?.codeExpiresAt, lang),
            })}
          </span>
        </Banner>
      )}

      {/* Header details */}
      <Card>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t('patient-detail:fields.phone')}>
            <a href={`tel:${p.phone}`} className="font-semibold text-primary hover:underline">
              {p.phone}
            </a>
          </Field>
          <Field label={t('patient-detail:fields.ageBand')}>{p.ageBand}</Field>
          <Field label={t('patient-detail:fields.language')}>
            {t(`patient-detail:languages.${p.language}`, { defaultValue: p.language })}
          </Field>
          <Field label={t('patient-detail:fields.procedureType')}>
            {t(`patient-detail:procedures.${p.procedureType}`, { defaultValue: p.procedureType })}
          </Field>
          <Field label={t('patient-detail:fields.dischargeDate')}>
            {formatDate(p.dischargeDate, lang)}
          </Field>
          <Field label={t('patient-detail:fields.recoveryDay')}>
            {t('patient-detail:dayValue', { n: p.recoveryDay })}
          </Field>
        </dl>
      </Card>

      {/* Enrichment metrics — denominators always shown */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard
          label={t('patient-detail:metrics.adherence')}
          value={formatPercent(p.adherence)}
          denominator={t('patient-detail:metrics.adherenceDenominator', {
            numerator: p.adherenceNumerator,
            denominator: p.adherenceDenominator,
          })}
        />
        <MetricCard
          label={t('patient-detail:metrics.openEscalations')}
          value={p.openEscalations}
          denominator={t('patient-detail:metrics.openEscalationsDenominator', {
            total: p.escalations.length,
          })}
        />
        <MetricCard
          label={t('patient-detail:metrics.lastActive')}
          value={p.lastActive ? formatDate(p.lastActive, lang) : t('patient-detail:metrics.never')}
          denominator={
            p.lastActive
              ? formatDateTime(p.lastActive, lang)
              : t('patient-detail:metrics.noActivity')
          }
        />
      </div>

      {/* Adherence over time */}
      <Section title={t('patient-detail:sections.adherenceOverTime')}>
        <AdherenceChart series={p.adherenceOverTime} />
      </Section>

      {/* Task completion history */}
      <Section title={t('patient-detail:sections.taskHistory')}>
        <TaskHistoryTable tasks={p.taskHistory} lang={lang} />
      </Section>

      {/* Check-ins with tier + outcome */}
      <Section title={t('patient-detail:sections.checkIns')}>
        <CheckInList items={p.checkIns} lang={lang} />
      </Section>

      {/* Escalation history */}
      <Section title={t('patient-detail:sections.escalations')}>
        <EscalationList items={p.escalations} lang={lang} />
      </Section>

      {/* Consent record — immutable */}
      <Section title={t('patient-detail:sections.consent')}>
        <Card>
          {p.consent ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-x-8 gap-y-2">
                <Field label={t('patient-detail:consent.version')}>{p.consent.version}</Field>
                <Field label={t('patient-detail:consent.acceptedAt')}>
                  {formatDateTime(p.consent.acceptedAt, lang)}
                </Field>
              </div>
              <p className="text-caption text-text-muted">{t('patient-detail:consent.immutable')}</p>
            </div>
          ) : (
            <p className="text-body text-text-muted">{t('patient-detail:consent.none')}</p>
          )}
        </Card>
      </Section>

      <ConfirmDialog
        open={confirmWithdraw}
        tone="danger"
        title={t('patient-detail:withdrawDialog.title')}
        confirmLabel={t('patient-detail:withdrawDialog.confirm')}
        busy={withdraw.isPending}
        onCancel={() => setConfirmWithdraw(false)}
        onConfirm={() =>
          withdraw.mutate(undefined, {
            onSuccess: () => setConfirmWithdraw(false),
          })
        }
      >
        {t('patient-detail:withdrawDialog.body')}
      </ConfirmDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function BackLink({ label }: { label: string }) {
  return (
    <Link
      to="/patients"
      className="inline-flex w-fit items-center gap-1 text-body font-semibold text-primary hover:underline"
    >
      <span aria-hidden="true">←</span>
      {label}
    </Link>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-h1 font-bold text-text">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-caption font-semibold uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="text-body text-text">{children}</dd>
    </div>
  );
}

function PatientStatusPill({ status, label }: { status: PatientStatus; label: string }) {
  const styles: Record<PatientStatus, string> = {
    [PatientStatus.enrolled]: 'bg-primary-light text-primary-dark border border-border',
    [PatientStatus.active]: 'bg-primary-light text-primary-dark border border-border',
    [PatientStatus.completed]: 'bg-surface text-success border border-success',
    [PatientStatus.withdrawn]: 'bg-surface text-text-muted border border-border',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-input px-3 py-1 text-caption font-semibold',
        styles[status],
      )}
    >
      {label}
    </span>
  );
}

function TaskHistoryTable({ tasks, lang }: { tasks: TaskHistoryItem[]; lang: string }) {
  const { t } = useTranslation('patient-detail');
  if (tasks.length === 0) {
    return <EmptyState title={t('taskHistory.emptyTitle')} description={t('taskHistory.emptyBody')} />;
  }

  const statusClass: Record<TaskStatus, string> = {
    [TaskStatus.completed]: 'text-success',
    [TaskStatus.missed]: 'text-overdue',
    [TaskStatus.pending]: 'text-text-muted',
  };

  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface">
      <table className="w-full border-collapse text-body">
        <thead>
          <tr className="border-b border-border">
            <Th>{t('taskHistory.day')}</Th>
            <Th>{t('taskHistory.taskType')}</Th>
            <Th>{t('taskHistory.status')}</Th>
            <Th>{t('taskHistory.onTime')}</Th>
            <Th>{t('taskHistory.completedAt')}</Th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id} className="border-b border-border last:border-b-0">
              <Td>{t('dayValue', { n: task.recoveryDay })}</Td>
              <Td>{t(`taskTypes.${task.taskType}`, { defaultValue: task.taskType })}</Td>
              <Td className={cn('font-semibold', statusClass[task.status])}>
                {t(`taskStatus.${task.status}`, { defaultValue: task.status })}
              </Td>
              <Td>
                {task.onTime === null
                  ? '—'
                  : task.onTime
                    ? t('taskHistory.onTimeYes')
                    : t('taskHistory.onTimeNo')}
              </Td>
              <Td>{task.completedAt ? formatDateTime(task.completedAt, lang) : '—'}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CheckInList({ items, lang }: { items: CheckInHistoryItem[]; lang: string }) {
  const { t } = useTranslation('patient-detail');
  if (items.length === 0) {
    return <EmptyState title={t('checkIns.emptyTitle')} description={t('checkIns.emptyBody')} />;
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((c) => (
        <Card key={c.id} className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-body font-semibold text-text">
              {formatDateTime(c.submittedAt, lang)}
            </span>
            <span className="text-caption text-text-muted">{t('dayValue', { n: c.recoveryDay })}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {c.tier ? (
              <TierBadge tier={c.tier} size="sm" />
            ) : (
              <span className="text-caption text-text-muted">{t('checkIns.noTier')}</span>
            )}
            {c.escalationStatus && <StatusChip status={c.escalationStatus} />}
            <span className="text-caption text-text-muted">
              {c.outcomeCode
                ? t(`outcomes.${c.outcomeCode}`, { defaultValue: c.outcomeCode })
                : t('checkIns.noOutcome')}
            </span>
          </div>
        </Card>
      ))}
    </div>
  );
}

function EscalationList({ items, lang }: { items: EscalationHistoryItem[]; lang: string }) {
  const { t } = useTranslation('patient-detail');
  if (items.length === 0) {
    return (
      <EmptyState title={t('escalations.emptyTitle')} description={t('escalations.emptyBody')} />
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((e) => (
        <Link key={e.id} to={`/escalations/${e.id}`} className="block">
          <Card className="flex flex-wrap items-center justify-between gap-3 transition-colors hover:bg-primary-light/40">
            <div className="flex flex-wrap items-center gap-3">
              <TierBadge tier={e.tier} size="sm" />
              <StatusChip status={e.status} />
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-caption text-text-muted">
                {e.outcomeCode
                  ? t(`outcomes.${e.outcomeCode}`, { defaultValue: e.outcomeCode })
                  : t('escalations.noOutcome')}
              </span>
              <span className="text-caption text-text-muted">{formatDateTime(e.createdAt, lang)}</span>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-caption font-semibold uppercase tracking-wide text-text-muted">
      {children}
    </th>
  );
}

function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn('px-4 py-3 text-text', className)}>{children}</td>;
}
