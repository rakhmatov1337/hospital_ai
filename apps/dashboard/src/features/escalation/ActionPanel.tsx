import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EscalationStatus } from '@hospital-ai/shared-types';
import { Banner, Button, Card, Select, SelectItem, StatusChip } from '../../ui';
import { ApiError, errorCodeOf } from '../../lib/api-client';
import {
  OUTCOME_CODES,
  useAcknowledge,
  useContact,
  type EscalationDetail,
  type OutcomeCode,
} from './api';

/** Reads `details.status` off a concurrency error, if present. */
function conflictStatus(error: unknown): string | null {
  if (error instanceof ApiError) {
    const s = error.details?.status;
    return typeof s === 'string' ? s : null;
  }
  return null;
}

function errorMessage(t: (k: string) => string, error: unknown): string {
  const code = errorCodeOf(error);
  // Prefer the escalation-namespaced copy; fall back to the errors namespace.
  const local = t(`errors.${code}`);
  return local.startsWith('errors.') ? t('errors.default') : local;
}

/**
 * The two forward-only actions (spec D3): Acknowledge (halts the ladder) and Mark
 * patient contacted (records a required OUTCOME + optional staff clinical note).
 * Nothing is editable after the fact and there is NO delete / dismiss-without-
 * outcome. Once contacted, this panel is read-only.
 */
export function ActionPanel({ detail }: { detail: EscalationDetail }) {
  const { t } = useTranslation('escalation');
  const acknowledge = useAcknowledge(detail.id);
  const contact = useContact(detail.id);

  const [outcome, setOutcome] = useState<'' | OutcomeCode>('');
  const [note, setNote] = useState('');

  const status = detail.status;
  const isNew = status === EscalationStatus.new;
  const isAcknowledged = status === EscalationStatus.acknowledged;
  const isContacted = status === EscalationStatus.contacted;
  const isBreached = status === EscalationStatus.breached;

  const canAcknowledge = isNew;
  const canContact = isNew || isAcknowledged;

  const ackConflict = conflictStatus(acknowledge.error);

  const submitContact = () => {
    if (outcome === '') return;
    contact.mutate({
      outcomeCode: outcome,
      clinicalNote: note.trim() === '' ? undefined : note.trim(),
    });
  };

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-h2 font-semibold text-text">{t('actions.title')}</h2>
        <StatusChip status={status as EscalationStatus} />
      </div>

      {/* Terminal read-only state: contacted with a recorded outcome. */}
      {isContacted && (
        <div className="space-y-3">
          <Banner tone="success" title={t('actions.closedTitle')}>
            {detail.outcomeCode && (
              <p>
                {t('actions.outcomeLabel')}:{' '}
                <span className="font-semibold">
                  {t(`outcomes.${detail.outcomeCode}`, { defaultValue: detail.outcomeCode })}
                </span>
              </p>
            )}
          </Banner>
          {detail.clinicalNote && (
            <div className="rounded-input bg-background p-4">
              <p className="text-caption font-semibold text-text-muted">
                {t('actions.clinicalNote')}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-body text-text">
                {detail.clinicalNote}
              </p>
            </div>
          )}
          <p className="text-caption text-text-muted">{t('actions.immutableNote')}</p>
        </div>
      )}

      {isBreached && (
        <Banner tone="danger" title={t('actions.breachedTitle')}>
          {t('actions.breachedBody')}
        </Banner>
      )}

      {/* Acknowledge — only while still new. Concurrent ack reveals the winner's state. */}
      {(canAcknowledge || isAcknowledged) && (
        <div className="space-y-2">
          {isAcknowledged ? (
            <Banner tone="success" title={t('actions.acknowledgedTitle')}>
              {t('actions.acknowledgedBody')}
            </Banner>
          ) : (
            <>
              <Button
                onClick={() => acknowledge.mutate()}
                disabled={acknowledge.isPending}
                fullWidth
              >
                {acknowledge.isPending ? t('actions.acknowledging') : t('actions.acknowledge')}
              </Button>
              <p className="text-caption text-text-muted">{t('actions.acknowledgeHint')}</p>
            </>
          )}
          {acknowledge.isError && (
            <Banner tone="warning" title={t('actions.alreadyHandledTitle')}>
              {ackConflict
                ? t('actions.alreadyHandledBody', {
                    status: t(`statusNames.${ackConflict}`, { defaultValue: ackConflict }),
                  })
                : errorMessage(t, acknowledge.error)}
            </Banner>
          )}
        </div>
      )}

      {/* Mark contacted — required outcome + optional staff-only clinical note. */}
      {canContact && (
        <div className="space-y-3 border-t border-border pt-4">
          <h3 className="text-body font-semibold text-text">{t('actions.contactTitle')}</h3>
          <Select
            label={t('actions.outcomeSelectLabel')}
            value={outcome}
            onValueChange={(v) => setOutcome(v as OutcomeCode)}
            placeholder={t('actions.outcomePlaceholder')}
          >
            {OUTCOME_CODES.map((code) => (
              <SelectItem key={code} value={code}>
                {t(`outcomes.${code}`)}
              </SelectItem>
            ))}
          </Select>

          <div className="flex flex-col gap-1">
            <label htmlFor="clinical-note" className="text-caption font-semibold text-text">
              {t('actions.clinicalNoteLabel')}
            </label>
            <textarea
              id="clinical-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder={t('actions.clinicalNotePlaceholder')}
              className="rounded-input border border-border bg-surface px-4 py-3 text-body text-text outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
            />
            <span className="text-caption text-text-muted">{t('actions.clinicalNoteHint')}</span>
          </div>

          <Button
            onClick={submitContact}
            disabled={outcome === '' || contact.isPending}
            fullWidth
          >
            {contact.isPending ? t('actions.contacting') : t('actions.markContacted')}
          </Button>
          <p className="text-caption text-text-muted">{t('actions.noDismissNote')}</p>

          {contact.isError && (
            <Banner tone="warning" title={t('actions.contactFailedTitle')}>
              {errorMessage(t, contact.error)}
            </Banner>
          )}
        </div>
      )}
    </Card>
  );
}
