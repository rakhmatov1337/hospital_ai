import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ContentActionResult,
  ContentItemDetail,
  ContentListItem,
  UnapprovedCountResult,
} from '@hospital-ai/shared-types';
import { apiClient } from '../../lib/api-client';

/**
 * D8 content-approval data layer (TanStack Query). All endpoints are staff-scoped
 * and clinic-scoped server-side; approve / request-changes are further gated to the
 * clinical lead (the service returns FORBIDDEN otherwise).
 */

const KEYS = {
  list: ['content', 'list'] as const,
  unapproved: ['content', 'unapproved-count'] as const,
  item: (id: string) => ['content', 'item', id] as const,
};

/** GET /v1/content — every content item with its derived review state. */
export function useContentList() {
  return useQuery({
    queryKey: KEYS.list,
    queryFn: () => apiClient.get<ContentListItem[]>('/content'),
  });
}

/** GET /v1/content/unapproved-count — the prominent launch-blocker badge. */
export function useUnapprovedCount() {
  return useQuery({
    queryKey: KEYS.unapproved,
    queryFn: () => apiClient.get<UnapprovedCountResult>('/content/unapproved-count'),
  });
}

/** GET /v1/content/items/:id — the three languages side by side + version history. */
export function useContentItem(id: string | null) {
  return useQuery({
    queryKey: id ? KEYS.item(id) : ['content', 'item', 'none'],
    queryFn: () => apiClient.get<ContentItemDetail>(`/content/items/${id as string}`),
    enabled: id !== null,
  });
}

/**
 * POST /v1/content/translations/:id/approve — approve one translation (per item PER
 * language). Approving EN never approves UZ/RU. Refetches the list, the launch-blocker
 * count, and the open item so every surface reflects the immutable approval record.
 */
export function useApproveTranslation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (translationId: string) =>
      apiClient.post<ContentActionResult>(`/content/translations/${translationId}/approve`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['content'] });
    },
  });
}

export interface RequestChangesInput {
  translationId: string;
  /** Proposed replacement wording (a NEW draft version is created from it). */
  text?: string;
  /** Reviewer note explaining the requested change (recorded in the audit log). */
  note?: string;
}

/**
 * POST /v1/content/translations/:id/request-changes — creates a NEW Draft version and
 * reverts the item to Needs review (the approved row is never mutated). This is the
 * "editing approved content pulls it from the patient app" flow.
 */
export function useRequestChanges() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ translationId, text, note }: RequestChangesInput) =>
      apiClient.post<ContentActionResult>(`/content/translations/${translationId}/request-changes`, {
        text,
        note,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['content'] });
    },
  });
}
