import { useSyncExternalStore, type ReactElement, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import {
  clearSession,
  getSession,
  setSession,
  subscribe,
  type StaffSessionData,
} from './session';
import type { StaffLoginResponse } from './api-types';

export type { StaffSessionData } from './session';

export interface AuthState {
  session: StaffSessionData | null;
  isAuthenticated: boolean;
  role: string | null;
  /** Persist a successful login response (from POST /v1/auth/staff/login). */
  signIn: (response: StaffLoginResponse) => void;
  /** Clear the session (sign out). Callers navigate to /login afterwards. */
  signOut: () => void;
}

/**
 * React binding over the framework-free session store. Backed by
 * useSyncExternalStore so every component re-renders on sign-in / sign-out.
 */
export function useAuth(): AuthState {
  const session = useSyncExternalStore(subscribe, getSession, getSession);
  return {
    session,
    isAuthenticated: session !== null,
    role: session?.role ?? null,
    signIn: (response: StaffLoginResponse) =>
      setSession({
        accessToken: response.accessToken,
        staffId: response.staffId,
        clinicId: response.clinicId,
        role: response.role,
      }),
    signOut: () => clearSession(),
  };
}

/** Route guard for every non-login route. Redirects to /login when signed out. */
export function RequireAuth({ children }: { children: ReactNode }): ReactElement {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
