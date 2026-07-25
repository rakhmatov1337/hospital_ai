import { useState } from 'react';
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
  IconBell,
  IconBellOff,
  IconLogout,
} from '@tabler/icons-react';
import { apiClient } from '../lib/api-client';
import type { ClinicView } from '../lib/api-types';
import { useAuth } from '../lib/auth';
import { setLanguage, SUPPORTED_LANGUAGES, type DashboardLanguage } from '../lib/i18n';
import { ConnectionStatus } from '../ui';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { cn } from '../lib/cn';
import { PlaceholderBanner } from './placeholder-banner';
import { useEscalationQueue } from '../features/queue/api';
import { useNewArrivalAlert } from '../features/queue/useNewArrivalAlert';
import { isAlertMuted, setAlertMuted } from '../features/queue/alert-sound';

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
  const [muted, setMuted] = useState(isAlertMuted);

  const clinicQuery = useQuery({
    queryKey: ['clinics', 'me'],
    queryFn: () => apiClient.get<ClinicView>('/clinics/me'),
    staleTime: 5 * 60_000,
  });

  // App-wide queue poll so a new EMERGENCY alerts (audibly + as a nav badge) no
  // matter which screen the clinician is on — not only the Queue. Shares the
  // ['escalations','unresolved'] cache with QueuePage, so there is still one poll.
  const queue = useEscalationQueue('unresolved');
  const criticalCount =
    (queue.data?.sections.emergency.length ?? 0) + (queue.data?.sections.urgent.length ?? 0);
  const hasEmergency = (queue.data?.sections.emergency.length ?? 0) > 0;
  // Fire the audible alert app-wide (QueuePage renders the visual banner, muted here).
  useNewArrivalAlert(queue.data, 'unresolved', { playSound: !muted });

  const currentNav = NAV_ITEMS.find(
    (item) => pathname === item.to || pathname.startsWith(`${item.to}/`),
  );
  const pageTitle = currentNav ? t(currentNav.key) : (clinicQuery.data?.name ?? t('loading'));

  function handleSignOut(): void {
    signOut();
    navigate('/login', { replace: true });
  }

  function toggleMute(): void {
    const next = !muted;
    setAlertMuted(next);
    setMuted(next);
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="px-3 py-4">
          <div className="flex items-center gap-2">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-input bg-sidebar-primary text-sidebar-primary-foreground">
              <IconActivityHeartbeat className="size-5" aria-hidden="true" />
            </div>
            <div className="grid min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate text-body font-bold text-sidebar-foreground">
                {t('app.name')}
              </span>
              <span className="truncate text-caption text-sidebar-foreground/60">
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
                  const showBadge = item.to === '/queue' && criticalCount > 0;
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
                      {showBadge && (
                        <SidebarMenuBadge
                          aria-label={t('nav.criticalCount', {
                            defaultValue: '{{count}} urgent or emergency',
                            count: criticalCount,
                          })}
                          className={cn(
                            hasEmergency
                              ? 'bg-tier-emergency text-white'
                              : 'bg-tier-urgent text-white',
                          )}
                        >
                          {criticalCount}
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="gap-2">
          {clinicQuery.data?.name && (
            <p
              className="truncate px-2 text-caption font-semibold text-sidebar-foreground/80 group-data-[collapsible=icon]:hidden"
              title={clinicQuery.data.name}
            >
              {clinicQuery.data.name}
            </p>
          )}
          {/* Full-width sign-out when expanded; icon-only when collapsed (P2-4). */}
          <button
            type="button"
            onClick={handleSignOut}
            className="flex h-9 items-center justify-center gap-2 rounded-input border border-sidebar-border text-caption font-semibold text-sidebar-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:hidden"
          >
            <IconLogout className="size-4" aria-hidden="true" />
            {t('topbar.signOut')}
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            aria-label={t('topbar.signOut')}
            title={t('topbar.signOut')}
            className="hidden size-8 items-center justify-center rounded-input text-sidebar-foreground/70 outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:flex"
          >
            <IconLogout className="size-5" aria-hidden="true" />
          </button>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-w-0">
        <header className="flex items-center gap-3 border-b border-border bg-background px-4 py-3 sm:px-6">
          <SidebarTrigger className="text-text-muted" />
          <p className="min-w-0 flex-1 truncate text-h2 font-semibold text-text">{pageTitle}</p>
          <ConnectionStatus
            isFetching={clinicQuery.isFetching}
            isError={clinicQuery.isError}
            lastUpdatedAt={clinicQuery.dataUpdatedAt || null}
          />
          <button
            type="button"
            onClick={toggleMute}
            aria-pressed={muted}
            aria-label={
              muted
                ? t('topbar.unmuteAlerts', { defaultValue: 'Unmute alert sound' })
                : t('topbar.muteAlerts', { defaultValue: 'Mute alert sound' })
            }
            title={
              muted
                ? t('topbar.unmuteAlerts', { defaultValue: 'Unmute alert sound' })
                : t('topbar.muteAlerts', { defaultValue: 'Mute alert sound' })
            }
            className="flex size-8 items-center justify-center rounded-input text-text-muted outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary"
          >
            {muted ? (
              <IconBellOff className="size-5" aria-hidden="true" />
            ) : (
              <IconBell className="size-5" aria-hidden="true" />
            )}
          </button>
          <div className="flex gap-1" role="group" aria-label={t('topbar.language')}>
            {SUPPORTED_LANGUAGES.map((lng) => (
              <button
                key={lng}
                type="button"
                onClick={() => setLanguage(lng as DashboardLanguage)}
                aria-pressed={i18n.resolvedLanguage === lng}
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
