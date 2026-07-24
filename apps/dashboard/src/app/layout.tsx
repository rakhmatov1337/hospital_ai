import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../lib/api-client';
import type { ClinicView } from '../lib/api-types';
import { useAuth } from '../lib/auth';
import { setLanguage, SUPPORTED_LANGUAGES, type DashboardLanguage } from '../lib/i18n';
import { Button, ConnectionStatus } from '../ui';
import { cn } from '../lib/cn';
import { PlaceholderBanner } from './placeholder-banner';

const NAV_ITEMS = [
  { to: '/queue', key: 'nav.queue' },
  { to: '/patients', key: 'nav.patients' },
  { to: '/metrics', key: 'nav.metrics' },
  { to: '/settings', key: 'nav.settings' },
  { to: '/content', key: 'nav.content' },
] as const;

/** Authenticated app shell: left nav + topbar + placeholder banner + routed content. */
export function AppLayout() {
  const { t, i18n } = useTranslation('common');
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const clinicQuery = useQuery({
    queryKey: ['clinics', 'me'],
    queryFn: () => apiClient.get<ClinicView>('/clinics/me'),
    staleTime: 5 * 60_000,
  });

  function handleSignOut(): void {
    signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-full bg-background">
      {/* Left navigation */}
      <aside className="flex w-56 shrink-0 flex-col gap-6 border-r border-border bg-surface p-4">
        <div>
          <p className="text-h2 font-bold text-primary">{t('app.name')}</p>
          <p className="text-caption text-text-muted">{t('app.subtitle')}</p>
        </div>
        <nav className="flex flex-col gap-1" aria-label={t('app.subtitle')}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'rounded-input px-3 py-2 text-body font-semibold outline-none transition-colors',
                  'focus-visible:ring-2 focus-visible:ring-primary',
                  isActive
                    ? 'bg-primary text-white'
                    : 'text-text hover:bg-primary-light',
                )
              }
            >
              {t(item.key)}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-6 py-3">
          <div className="min-w-0">
            <p className="truncate text-h2 font-semibold text-text">
              {clinicQuery.data?.name ?? t('loading')}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <ConnectionStatus
              isFetching={clinicQuery.isFetching}
              isError={clinicQuery.isError}
              lastUpdatedAt={clinicQuery.dataUpdatedAt || null}
            />
            <div className="flex gap-1" role="group" aria-label={t('topbar.language')}>
              {SUPPORTED_LANGUAGES.map((lng) => (
                <button
                  key={lng}
                  type="button"
                  onClick={() => setLanguage(lng as DashboardLanguage)}
                  className={cn(
                    'rounded-input px-2 py-1 text-caption font-semibold uppercase outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    i18n.resolvedLanguage === lng
                      ? 'bg-primary text-white'
                      : 'text-text-muted hover:bg-primary-light',
                  )}
                >
                  {lng}
                </button>
              ))}
            </div>
            <Button variant="secondary" size="sm" onClick={handleSignOut}>
              {t('topbar.signOut')}
            </Button>
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-6 p-6">
          <PlaceholderBanner />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
