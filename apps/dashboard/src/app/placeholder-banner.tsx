import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../lib/api-client';
import { Banner } from '../ui';

interface UnapprovedCount {
  count: number;
}

/**
 * Placeholder-content banner (cross-cutting): shows whenever unapproved / placeholder
 * clinical content is active. Queries GET /v1/content/unapproved-count and stays
 * silent if the endpoint is unavailable or the count is zero.
 */
export function PlaceholderBanner() {
  const { t } = useTranslation('common');
  const { data } = useQuery({
    queryKey: ['content', 'unapproved-count'],
    queryFn: () => apiClient.get<UnapprovedCount>('/content/unapproved-count'),
    retry: false,
    staleTime: 60_000,
  });

  if (!data || data.count <= 0) return null;

  return (
    <Banner tone="warning" title={t('placeholderBanner.title')}>
      {t('placeholderBanner.body')}
    </Banner>
  );
}
