import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiClient, errorCodeOf } from '../../lib/api-client';
import type { StaffLoginResponse } from '../../lib/api-types';
import { useAuth } from '../../lib/auth';
import { setLanguage, SUPPORTED_LANGUAGES, type DashboardLanguage } from '../../lib/i18n';
import { Button, Card, Input } from '../../ui';
import { cn } from '../../lib/cn';

/** D1 — Staff login. Clinic branding, email + password. No self-registration. */
export function LoginPage() {
  const { t, i18n } = useTranslation(['login', 'common', 'errors']);
  const { isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? '/queue';

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const session = await apiClient.post<StaffLoginResponse>('/auth/staff/login', {
        email: email.trim(),
        password,
      });
      signIn(session);
      navigate(from, { replace: true });
    } catch (err) {
      const code = errorCodeOf(err);
      setError(
        code === 'UNAUTHORIZED'
          ? t('login:invalidCredentials')
          : t(`errors:${code}`, { defaultValue: t('errors:default') }),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-display font-bold text-primary">{t('common:app.name')}</p>
            <p className="text-body text-text-muted">{t('common:app.subtitle')}</p>
          </div>
          <div className="flex gap-1" role="group" aria-label={t('common:topbar.language')}>
            {SUPPORTED_LANGUAGES.map((lng) => (
              <button
                key={lng}
                type="button"
                onClick={() => setLanguage(lng as DashboardLanguage)}
                className={cn(
                  'rounded-input px-2 py-1 text-caption font-semibold uppercase',
                  i18n.resolvedLanguage === lng
                    ? 'bg-primary text-white'
                    : 'text-text-muted hover:bg-primary-light',
                )}
              >
                {lng}
              </button>
            ))}
          </div>
        </div>

        <Card className="p-6">
          <h1 className="text-h1 font-bold text-text">{t('login:title')}</h1>
          <p className="mt-1 text-body text-text-muted">{t('login:subtitle')}</p>

          <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit} noValidate>
            <Input
              label={t('login:emailLabel')}
              type="email"
              autoComplete="email"
              required
              value={email}
              placeholder={t('login:emailPlaceholder')}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label={t('login:passwordLabel')}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              placeholder={t('login:passwordPlaceholder')}
              onChange={(e) => setPassword(e.target.value)}
            />

            {error && (
              <p role="alert" className="text-body text-tier-emergency">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" fullWidth disabled={submitting}>
              {submitting ? t('login:submitting') : t('login:submit')}
            </Button>
          </form>

          <div className="mt-4 flex flex-col gap-1 text-caption text-text-muted">
            <a href="#" title={t('login:forgotPasswordHelp')} className="font-semibold text-primary">
              {t('login:forgotPassword')}
            </a>
            <p>{t('login:noRegistration')}</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
