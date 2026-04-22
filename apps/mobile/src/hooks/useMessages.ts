import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { CursorPage, MessageWithSender } from '@mokshavoice/shared-types';

export function useMessages(sessionId: string) {
  return useInfiniteQuery({
    queryKey: ['messages', sessionId],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '30' });
      if (pageParam) params.set('cursor', pageParam);
      return api.get<CursorPage<MessageWithSender>>(
        `/v1/sessions/${sessionId}/messages?${params}`,
      );
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    enabled: !!sessionId,
  });
}
