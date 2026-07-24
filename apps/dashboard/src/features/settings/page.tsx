import { useTranslation } from 'react-i18next';
import { Banner, Spinner } from '../../ui';
import { ClinicSettingsForm } from './clinic-settings-form';
import { StaffSection } from './staff-section';
import { useClinic } from './api';

/**
 * D7 — Clinic settings. Loads the authenticated clinic, renders the settings form
 * (name/phone/emergency changes go through a confirm dialog + are audit-logged
 * server-side) and the staff-accounts section.
 */
export function SettingsPage() {
  const { t } = useTranslation(['settings', 'common']);
  const clinicQuery = useClinic();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-h1 font-bold text-text">{t('settings:title')}</h1>
        <p className="mt-1 text-body text-text-muted">{t('settings:subtitle')}</p>
      </header>

      {clinicQuery.isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" label={t('common:loading')} />
        </div>
      ) : clinicQuery.isError || !clinicQuery.data ? (
        <Banner tone="danger">{t('settings:error')}</Banner>
      ) : (
        <ClinicSettingsForm clinic={clinicQuery.data} />
      )}

      <StaffSection />
    </div>
  );
}
