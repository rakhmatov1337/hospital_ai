import type { ApiErrorBody, ErrorCode } from '@hospital-ai/shared-types';
import { clearSession, getToken } from './session';

/**
 * Typed fetch layer against the api's `/v1` surface.
 *
 *  - Base URL from `VITE_API_BASE_URL` (already includes `/v1`); paths are given
 *    relative to it, e.g. `apiClient.get('/escalations')`.
 *  - Attaches the stored staff JWT (`Authorization: Bearer …`) on every request.
 *  - On 401 → clears the session and redirects to `/login` (unless already there).
 *  - Non-2xx bodies `{ code, message, details }` become an `ApiError` carrying the
 *    machine `code` so the UI can map it to an i18n message (see errors namespace).
 */

const RAW_BASE = import.meta.env.VITE_API_BASE_URL ?? '/v1';
const BASE_URL = RAW_BASE.replace(/\/+$/, '');

export class ApiError extends Error {
  readonly code: ErrorCode | string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message || body.code || 'Request failed');
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code ?? 'INTERNAL_ERROR';
    this.details = body.details;
  }
}

type Method = 'GET' | 'POST' | 'PATCH';

function isErrorBody(value: unknown): value is ApiErrorBody {
  return typeof value === 'object' && value !== null && 'code' in value;
}

function redirectToLogin(): void {
  clearSession();
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.location.assign('/login');
  }
}

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401) {
    redirectToLogin();
    throw new ApiError(401, { code: 'UNAUTHORIZED', message: 'Session expired.' });
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const raw = await res.text();
  const data: unknown = raw ? JSON.parse(raw) : undefined;

  if (!res.ok) {
    const errorBody: ApiErrorBody = isErrorBody(data)
      ? data
      : { code: 'INTERNAL_ERROR', message: res.statusText || 'Request failed.' };
    throw new ApiError(res.status, errorBody);
  }

  return data as T;
}

export const apiClient = {
  get: <T>(path: string): Promise<T> => request<T>('GET', path),
  post: <T>(path: string, body?: unknown): Promise<T> => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown): Promise<T> => request<T>('PATCH', path, body),
};

/** Extract the machine error code from any thrown value (for i18n mapping). */
export function errorCodeOf(error: unknown): string {
  return error instanceof ApiError ? error.code : 'INTERNAL_ERROR';
}
