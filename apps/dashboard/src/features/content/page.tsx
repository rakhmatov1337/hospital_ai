import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Language, type ContentListItem } from '@hospital-ai/shared-types';
import { Banner, Button, DataTable, Spinner, type Column } from '../../ui';
import { cn } from '../../lib/cn';
import { ContentStatusBadge } from './ContentStatusBadge';
import { ContentDetail } from './ContentDetail';
import { useContentList, useUnapprovedCount } from './api';

type FilterKey = 'all' | 'needsApproval' | 'missingTranslation' | 'approved';
const FILTERS: FilterKey[] = ['all', 'needsApproval', 'missingTranslation', 'approved'];
const ALL_LANGS: Language[] = [Language.EN, Language.UZ, Language.RU];

function matchesFilter(item: ContentListItem, filter: FilterKey): boolean {
  switch (filter) {
    case 'needsApproval':
      return item.needsApproval;
    case 'missingTranslation':
      return item.missingLanguages.length > 0;
    case 'approved':
      return item.status === 'approved';
    default:
      return true;
  }
}

/** Small EN/UZ/RU presence row — present = teal chip, missing = greyed. Never colour alone. */
function LanguagePresence({ item }: { item: ContentListItem }) {
  const present = new Set(item.languagesPresent);
  return (
    <span className="inline-flex gap-1">
      {ALL_LANGS.map((lang) => {
        const has = present.has(lang);
        return (
          <span
            key={lang}
            title={lang}
            className={cn(
              'inline-flex items-center gap-0.5 rounded-input px-1.5 py-0.5 text-caption font-semibold',
              has
                ? 'border border-primary bg-primary/10 text-primary'
                : 'border border-border bg-background text-text-muted',
            )}
          >
            <span aria-hidden="true">{has ? '✓' : '—'}</span>
            {lang}
          </span>
        );
      })}
    </span>
  );
}

/** D8 — Content approval (clinical lead). Approve per item PER language + launch blocker. */
export function ContentPage() {
  const { t, i18n } = useTranslation('content');
  const [filter, setFilter] = useState<FilterKey>('needsApproval');
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useContentList();
  const count = useUnapprovedCount();

  const rows = useMemo(
    () => (list.data ?? []).filter((item) => matchesFilter(item, filter)),
    [list.data, filter],
  );

  const dateFmt = (iso: string | null): string => {
    if (!iso) return t('list.never');
    try {
      const dateLocale = i18n.language.startsWith('ru')
        ? 'ru-RU'
        : i18n.language.startsWith('uz')
          ? 'uz'
          : 'en-GB';
      return new Intl.DateTimeFormat(dateLocale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const columns: Array<Column<ContentListItem>> = [
    {
      key: 'item',
      header: t('list.item'),
      sortable: true,
      sortValue: (r) => r.contentKey,
      render: (r) => <span className="font-semibold text-text">{r.contentKey}</span>,
    },
    {
      key: 'category',
      header: t('list.category'),
      sortable: true,
      sortValue: (r) => r.category,
      render: (r) => <span className="text-text-muted">{r.category}</span>,
    },
    {
      key: 'status',
      header: t('list.status'),
      sortable: true,
      sortValue: (r) => r.status,
      render: (r) => <ContentStatusBadge status={r.status} />,
    },
    {
      key: 'languages',
      header: t('list.languages'),
      render: (r) => <LanguagePresence item={r} />,
    },
    {
      key: 'lastApproved',
      header: t('list.lastApproved'),
      sortable: true,
      sortValue: (r) => r.lastApprovedAt ?? '',
      render: (r) => (
        <span className="text-text-muted">
          {dateFmt(r.lastApprovedAt)}
          {r.lastApprovedBy && (
            <span className="block text-caption">
              {t('list.lastApprovedBy', { who: r.lastApprovedBy })}
            </span>
          )}
        </span>
      ),
    },
  ];

  const unapproved = count.data?.unapprovedItems ?? 0;
  const total = count.data?.totalItems ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-display font-bold text-text">{t('title')}</h1>
        <p className="mt-1 text-body text-text-muted">{t('subtitle')}</p>
      </header>

      {/* Prominent launch-blocker: unapproved count. */}
      {count.data && (
        <Banner
          tone={unapproved > 0 ? 'warning' : 'success'}
          title={
            unapproved > 0
              ? t('blocker.pending', { count: unapproved, total })
              : t('blocker.clear', { total })
          }
        >
          {unapproved > 0 ? t('blocker.pendingBody') : t('blocker.clearBody')}
        </Banner>
      )}

      {/* Editing-approved-content note (safety line) — compact so it doesn't
          compete with the launch-blocker above it. */}
      <p className="flex items-start gap-2 text-caption text-text-muted">
        <span aria-hidden="true" className="mt-px">ⓘ</span>
        <span>
          <span className="font-semibold text-text">{t('editWarning.title')}</span>{' '}
          {t('editWarning.body')}
        </span>
      </p>

      {/* Filters. */}
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label={t('filters.label')}
      >
        {FILTERS.map((f) => (
          <Button
            key={f}
            variant="ghost"
            size="sm"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={cn(
              filter === f
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'text-text-muted hover:bg-primary/10',
            )}
          >
            {t(`filters.${f}`)}
          </Button>
        ))}
      </div>

      {list.isLoading && (
        <div className="flex justify-center p-8">
          <Spinner size="lg" label={t('title')} />
        </div>
      )}
      {list.isError && (
        <Banner
          tone="danger"
          title={t('error.title', { defaultValue: "Couldn't load content" })}
          action={
            <Button variant="secondary" size="sm" onClick={() => void list.refetch()}>
              {t('error.retry', { defaultValue: 'Retry' })}
            </Button>
          }
        >
          {t('toast.error')}
        </Banner>
      )}

      {list.data && (
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.id}
          onRowClick={(r) => setOpenId(r.id)}
          emptyTitle={t('list.emptyTitle')}
          emptyDescription={t('list.emptyBody')}
        />
      )}

      {openId && <ContentDetail itemId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
