import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from '../lib/auth';
import { AppLayout } from './layout';
import { LoginPage } from '../features/login/page';
import { QueuePage } from '../features/queue/page';
import { EscalationDetailPage } from '../features/escalation/page';
import { PatientsPage } from '../features/patients/page';
import { PatientCreatePage, PatientDetailPage } from '../features/patient-detail/page';
import { MetricsPage } from '../features/metrics/page';
import { SettingsPage } from '../features/settings/page';
import { ContentPage } from '../features/content/page';
import { ShellPreview } from '../features/dev/shell-preview';
import { ScreensPreview } from '../features/dev/screens-preview';

/**
 * All routes. Non-login routes are wrapped in <RequireAuth> inside <AppLayout>.
 * Screen agents fill in the imported page components; these paths + names are pinned.
 */
export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dev/shell" element={<AppLayout />}>
        <Route index element={<ShellPreview />} />
      </Route>
      <Route path="/dev/screens" element={<ScreensPreview />}>
        <Route index element={<QueuePage />} />
        <Route path="content" element={<ContentPage />} />
        <Route path="patients" element={<PatientsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/queue" replace />} />
        <Route path="/queue" element={<QueuePage />} />
        <Route path="/escalations/:id" element={<EscalationDetailPage />} />
        <Route path="/patients" element={<PatientsPage />} />
        <Route path="/patients/new" element={<PatientCreatePage />} />
        <Route path="/patients/:id" element={<PatientDetailPage />} />
        <Route path="/metrics" element={<MetricsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/content" element={<ContentPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/queue" replace />} />
    </Routes>
  );
}
