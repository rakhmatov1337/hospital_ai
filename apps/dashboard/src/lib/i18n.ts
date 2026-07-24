import i18n, { type BackendModule, type ReadCallback, type Resource } from 'i18next';
import { initReactI18next } from 'react-i18next';

/**
 * Dashboard i18n — EN + RU only, staff-facing, NAMESPACE-PER-SCREEN.
 *
 * Each screen owns `src/locales/{en,ru}/<screen>.json` and declares its namespace
 * via `useTranslation('<screen>')`; the namespace file is lazily imported on first
 * use through the custom Vite-glob backend below. Shared namespaces (`common`,
 * `errors`) are declared up front. NO patient content-library strings live here.
 */

const LANG_KEY = 'hospital_ai.lang';
export const SUPPORTED_LANGUAGES = ['en', 'ru'] as const;
export type DashboardLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// Lazy loaders keyed by "../locales/<lng>/<ns>.json".
const loaders = import.meta.glob('../locales/*/*.json') as Record<
  string,
  () => Promise<{ default: Resource }>
>;

const lazyBackend: BackendModule = {
  type: 'backend',
  init: () => {
    /* no options */
  },
  read: (language: string, namespace: string, callback: ReadCallback) => {
    const path = `../locales/${language}/${namespace}.json`;
    const load = loaders[path];
    if (!load) {
      // Missing namespace file → resolve empty so i18next falls back gracefully.
      callback(null, {});
      return;
    }
    load()
      .then((module) => callback(null, module.default))
      .catch((error: unknown) =>
        callback(error instanceof Error ? error : new Error(String(error)), null),
      );
  },
};

function initialLanguage(): DashboardLanguage {
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored === 'en' || stored === 'ru') return stored;
  } catch {
    /* ignore */
  }
  return 'en';
}

void i18n
  .use(lazyBackend)
  .use(initReactI18next)
  .init({
    lng: initialLanguage(),
    fallbackLng: 'en',
    supportedLngs: [...SUPPORTED_LANGUAGES],
    load: 'languageOnly',
    ns: ['common', 'errors', 'login'],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

i18n.on('languageChanged', (lng) => {
  try {
    localStorage.setItem(LANG_KEY, lng);
  } catch {
    /* ignore */
  }
});

/** Switch the active language and persist the choice. */
export function setLanguage(lng: DashboardLanguage): void {
  void i18n.changeLanguage(lng);
}

export default i18n;
