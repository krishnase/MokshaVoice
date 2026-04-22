import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type {
  CursorPage,
  SessionWithMeta,
  CreateSessionResponse,
  SessionStatus,
} from '@mokshavoice/shared-types';

export function useSessions(status?: SessionStatus) {
  return useInfiniteQuery({
    queryKey: ['sessions', status ?? 'all'],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ sort: 'createdAt' });
      if (status) params.set('status', status);
      if (pageParam) params.set('cursor', pageParam);
      return api.get<CursorPage<SessionWithMeta>>(`/v1/sessions?${params}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  });
}

export function useCreateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<CreateSessionResponse>('/v1/sessions'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  });
}
