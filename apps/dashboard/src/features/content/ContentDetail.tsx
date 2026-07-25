import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ContentLanguageState, ContentTranslationView } from '@hospital-ai/shared-types';
import { Banner, Button, Spinner } from '../../ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '../../lib/auth';
import { cn } from '../../lib/cn';
import { ContentStatusBadge, type ContentBadgeStatus } from './ContentStatusBadge';
import { useApproveTranslation, useContentItem, useRequestChanges } from './api';

function formatDateTime(iso: string | null, lng: string): string {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat(lng === 'ru' ? 'ru-RU' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** One language column: current text, review actions, and version history. */
function LanguageColumn({ state }: { state: ContentLanguageState }) {
  const { t, i18n } = useTranslation('content');
  const { role } = useAuth();
  const isLead = role === 'clinical_lead';
  const approve = useApproveTranslation();
  const requestChanges = useRequestChanges();

  const [formOpen, setFormOpen] = useState(false);
  const [note, setNote] = useState('');
  const [proposed, setProposed] = useState('');

  const current = state.current;
  const langName = t(`lang.${state.language}`);
  const reviewStatus = (current ? current.reviewStatus : 'missing') as ContentBadgeStatus;
  const isApproved = reviewStatus === 'approved';
  const busy = approve.isPending || requestChanges.isPending;

  function onApprove(): void {
    if (!current) return;
    approve.mutate(current.id);
  }

  function onSubmitRequest(): void {
    if (!current) return;
    requestChanges.mutate(
      { translationId: current.id, note: note.trim() || undefined, text: proposed.trim() || undefined },
      {
        onSuccess: () => {
          setFormOpen(false);
          setNote('');
          setProposed('');
        },
      },
    );
  }

  return (
    <section
      className="flex min-w-0 flex-1 flex-col gap-3 rounded-card border border-border bg-surface p-4"
      aria-label={langName}
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-h2 font-semibold text-text">{langName}</h3>
        <ContentStatusBadge status={reviewStatus} />
      </header>

      {current ? (
        <>
          <div className="rounded-input border border-border bg-background p-3">
            <p className="mb-1 text-caption text-text-muted">
              {t('detail.current')} · {t('detail.version', { n: current.version })}
            </p>
            <p className="whitespace-pre-wrap break-words text-body text-text">{current.text}</p>
            {current.isPlaceholder && (
              <p className="mt-2 text-caption text-text-muted">{t('detail.placeholderNote')}</p>
            )}
          </div>

          <p className="text-caption text-text-muted">
            {current.approvedBy
              ? `${t('detail.approvedBy', { who: current.approvedBy })} · ${t('detail.approvedAt', { time: formatDateTime(current.approvedAt, i18n.language) })}`
              : t('detail.created', { time: formatDateTime(current.createdAt, i18n.language) })}
          </p>

          {/* Per-language actions (clinical lead only). */}
          <div className="flex flex-col gap-2">
            {isLead ? (
              <>
                <Button
                  size="sm"
                  onClick={onApprove}
                  disabled={isApproved || busy}
                  aria-label={t('actions.approve', { lang: langName })}
                >
                  {isApproved ? t('actions.alreadyApproved') : t('actions.approve', { lang: langName })}
                </Button>
                {!formOpen ? (
                  <Button size="sm" variant="secondary" onClick={() => setFormOpen(true)} disabled={busy}>
                    {t('actions.requestChanges')}
                  </Button>
                ) : (
                  <div className="flex flex-col gap-2 rounded-input border border-border p-3">
                    <label className="text-caption font-semibold text-text" htmlFor={`note-${current.id}`}>
                      {t('actions.noteLabel')}
                    </label>
                    <textarea
                      id={`note-${current.id}`}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={t('actions.notePlaceholder')}
                      rows={3}
                      className="rounded-input border border-border bg-surface p-2 text-body text-text outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
                    />
                    <label className="text-caption font-semibold text-text" htmlFor={`text-${current.id}`}>
                      {t('actions.proposedLabel')}
                    </label>
                    <textarea
                      id={`text-${current.id}`}
                      value={proposed}
                      onChange={(e) => setProposed(e.target.value)}
                      placeholder={t('actions.proposedPlaceholder')}
                      rows={3}
                      className="rounded-input border border-border bg-surface p-2 text-body text-text outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={onSubmitRequest} disabled={busy}>
                        {t('actions.submitRequest')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setFormOpen(false)}
                        disabled={busy}
                      >
                        {t('actions.cancel')}
                      </Button>
                    </div>
                  </div>
                )}
                {!isApproved && (
                  <p className="text-caption text-text-muted">
                    {t('actions.approveHint', { lang: langName })}
                  </p>
                )}
              </>
            ) : (
              <p className="text-caption text-text-muted">{t('permission.leadOnly')}</p>
            )}
          </div>
        </>
      ) : (
        <p className="rounded-input border border-dashed border-border bg-background p-3 text-body text-text-muted">
          {t('detail.missingText')}
        </p>
      )}

      {/* Version history (older versions below the current one). */}
      <div className="mt-1">
        <p className="mb-1 text-caption font-semibold uppercase tracking-wide text-text-muted">
          {t('detail.versionHistory')}
        </p>
        {state.history.length > 1 ? (
          <ul className="flex flex-col gap-2">
            {state.history.slice(1).map((v: ContentTranslationView) => (
              <li key={v.id} className="rounded-input border border-border bg-background p-2">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-caption font-semibold text-text">
                    {t('detail.version', { n: v.version })}
                  </span>
                  <ContentStatusBadge status={v.reviewStatus as ContentBadgeStatus} />
                </div>
                <p className="line-clamp-3 whitespace-pre-wrap break-words text-caption text-text-muted">
                  {v.text}
                </p>
                <p className="mt-1 text-caption text-text-muted">
                  {v.approvedBy
                    ? t('detail.approvedBy', { who: v.approvedBy })
                    : t('detail.created', { time: formatDateTime(v.createdAt, i18n.language) })}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-caption text-text-muted">{t('detail.noHistory')}</p>
        )}
      </div>
    </section>
  );
}

/** Modal showing one content item's three languages side by side + version history. */
export function ContentDetail({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const { t } = useTranslation('content');
  const { data, isLoading, isError } = useContentItem(itemId);

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-h-[90vh] overflow-y-auto sm:max-w-6xl"
      >
        <DialogHeader className="flex-row items-start justify-between gap-4">
          <div>
            <DialogTitle className="text-h1 font-bold text-text">
              {data ? data.contentKey : t('detail.heading')}
            </DialogTitle>
            {data && (
              <DialogDescription className="text-body text-text-muted">
                {data.category}
              </DialogDescription>
            )}
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t('detail.close')}
          </Button>
        </DialogHeader>

        <Banner tone="warning" title={t('editWarning.title')} className="mb-4">
          {t('editWarning.body')}
        </Banner>

        {isLoading && (
          <div className="flex justify-center p-8">
            <Spinner size="lg" label={t('detail.heading')} />
          </div>
        )}
        {isError && <p className="p-4 text-body text-tier-emergency">{t('toast.error')}</p>}

        {data && (
          <>
            <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
              {t('detail.sideBySide')}
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {data.languages.map((state) => (
                <LanguageColumn key={state.language} state={state} />
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
