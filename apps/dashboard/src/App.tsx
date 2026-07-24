import { QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { BrowserRouter } from 'react-router-dom';
import i18n from './lib/i18n';
import { queryClient } from './lib/query';
import { AppRouter } from './app/router';

/** Root providers: i18n, TanStack Query, and the router. */
export function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
      </QueryClientProvider>
    </I18nextProvider>
  );
}
