import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../lib/auth';
import { setLanguage, SUPPORTED_LANGUAGES, type DashboardLanguage } from '../../lib/i18n';
import { cn } from '../../lib/cn';
import { LoginForm } from '../../components/login-form';

/** D1 — Staff login. Clinic branding + language switcher wrap the shadcn login-01 block. */
export function LoginPage() {
  const { t, i18n } = useTranslation(['login', 'common']);
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  const from = (location.state as { from?: string } | null)?.from ?? '/queue';

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
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
                aria-pressed={i18n.resolvedLanguage === lng}
                className={cn(
                  'rounded-input px-2 py-1 text-caption font-semibold',
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
        </div>

        <LoginForm />
      </div>
    </div>
  );
}
