import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  IconClipboardList,
  IconUsers,
  IconChartBar,
  IconSettings,
  IconFileText,
  IconActivityHeartbeat,
} from '@tabler/icons-react';
import { apiClient } from '../lib/api-client';
import type { ClinicView } from '../lib/api-types';
import { useAuth } from '../lib/auth';
import { setLanguage, SUPPORTED_LANGUAGES, type DashboardLanguage } from '../lib/i18n';
import { Button, ConnectionStatus } from '../ui';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { cn } from '../lib/cn';
import { PlaceholderBanner } from './placeholder-banner';

const NAV_ITEMS = [
  { to: '/queue', key: 'nav.queue', icon: IconClipboardList },
  { to: '/patients', key: 'nav.patients', icon: IconUsers },
  { to: '/metrics', key: 'nav.metrics', icon: IconChartBar },
  { to: '/settings', key: 'nav.settings', icon: IconSettings },
  { to: '/content', key: 'nav.content', icon: IconFileText },
] as const;

/** Authenticated app shell: collapsible shadcn sidebar + topbar + routed content. */
export function AppLayout() {
  const { t, i18n } = useTranslation('common');
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

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
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="px-3 py-4">
          <div className="flex items-center gap-2">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-input bg-primary text-primary-foreground">
              <IconActivityHeartbeat className="size-5" aria-hidden="true" />
            </div>
            <div className="grid min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate text-body font-bold text-primary">{t('app.name')}</span>
              <span className="truncate text-caption text-muted-foreground">
                {t('app.subtitle')}
              </span>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_ITEMS.map((item) => {
                  const isActive = pathname === item.to || pathname.startsWith(`${item.to}/`);
                  const label = t(item.key);
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        isActive={isActive}
                        tooltip={label}
                        render={<NavLink to={item.to} />}
                      >
                        <item.icon aria-hidden="true" />
                        <span>{label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="gap-2 group-data-[collapsible=icon]:hidden">
          {clinicQuery.data?.name && (
            <p className="truncate px-2 text-caption font-semibold text-text" title={clinicQuery.data.name}>
              {clinicQuery.data.name}
            </p>
          )}
          <Button variant="secondary" size="sm" fullWidth onClick={handleSignOut}>
            {t('topbar.signOut')}
          </Button>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-w-0">
        <header className="flex items-center gap-3 border-b border-border bg-background px-4 py-3 sm:px-6">
          <SidebarTrigger className="text-text-muted" />
          <p className="min-w-0 flex-1 truncate text-h2 font-semibold text-text">
            {clinicQuery.data?.name ?? t('loading')}
          </p>
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
                  'rounded-input px-2 py-1 text-caption font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  lng === 'uz' ? 'normal-case' : 'uppercase',
                  i18n.resolvedLanguage === lng
                    ? 'bg-primary text-primary-foreground'
                    : 'text-text-muted hover:bg-primary/10',
                )}
              >
                {lng === 'uz' ? "O'zbekcha" : lng}
              </button>
            ))}
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-6 p-6">
          <PlaceholderBanner />
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
