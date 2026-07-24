import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api-client';

/**
 * Shared QueryClient. A 401 is already handled by the api-client (clears session
 * + redirects), so queries never retry on auth failures.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 10_000,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          return false;
        }
        return failureCount < 1;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
