/**
 * Staff session store — in-memory + localStorage (refresh-safe), framework-free.
 *
 * This module has NO React dependency so the non-React api-client can read the
 * token and clear the session on 401 without importing the React auth layer.
 * `auth.tsx` builds `useAuth()` / `<RequireAuth>` on top of it.
 */

const STORAGE_KEY = 'hospital_ai.staff.session';

export interface StaffSessionData {
  accessToken: string;
  staffId: string;
  clinicId: string;
  role: string;
}

type Listener = () => void;
const listeners = new Set<Listener>();

function readStorage(): StaffSessionData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StaffSessionData>;
    if (typeof parsed.accessToken === 'string' && parsed.accessToken.length > 0) {
      return {
        accessToken: parsed.accessToken,
        staffId: parsed.staffId ?? '',
        clinicId: parsed.clinicId ?? '',
        role: parsed.role ?? 'staff',
      };
    }
    return null;
  } catch {
    return null;
  }
}

let current: StaffSessionData | null = readStorage();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Current session (or null). Stable reference between changes for useSyncExternalStore. */
export function getSession(): StaffSessionData | null {
  return current;
}

/** Bearer token for the api-client, or null when signed out. */
export function getToken(): string | null {
  return current?.accessToken ?? null;
}

export function setSession(session: StaffSessionData): void {
  current = session;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* storage may be unavailable (private mode) — memory copy still works */
  }
  emit();
}

export function clearSession(): void {
  current = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  emit();
}

/** Subscribe to session changes (used by useAuth via useSyncExternalStore). */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
