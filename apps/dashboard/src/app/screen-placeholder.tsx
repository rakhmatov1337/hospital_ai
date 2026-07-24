import { useTranslation } from 'react-i18next';
import { EmptyState } from '../ui';

/**
 * Neutral placeholder used by not-yet-built screens. Each screen agent replaces
 * its `features/<screen>/page.tsx` with the real implementation; the router and
 * these exported page names stay stable.
 */
export function ScreenPlaceholder({ title }: { title: string }) {
  const { t } = useTranslation('common');
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1 font-bold text-text">{title}</h1>
      <EmptyState
        title={t('screenPlaceholder.title', { screen: title })}
        description={t('screenPlaceholder.body')}
      />
    </div>
  );
}
