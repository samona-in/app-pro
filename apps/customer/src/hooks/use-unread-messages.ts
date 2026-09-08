import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MessageUnreadSummary, MessageUnreadUpdate } from '@samona/types';
import { queryKeys } from '@/constants';
import { messagesApi } from '@/services/messages';
import { subscribe } from '@/services/realtime';
import { useSession } from './use-session';

/**
 * The signed-in surface's unread chat counts, keyed by job.
 *
 * One query serves every chat entry point — headers, booking cards, tab icons —
 * so a badge anywhere moves the moment the count does. REST loads the baseline;
 * the `message:unread` socket event applies the deltas live (the server emits
 * it on send and on mark-read). A job entry is dropped at zero so the badge
 * disappears once the thread is opened.
 *
 * The event is addressed to a surface's role: the same account can be both
 * sides of a job, so only the badge of the role the app acts as moves.
 */
export function useUnreadMessages() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const userId = user?.id ?? '';
  const unreadKey = useMemo(() => queryKeys.messages.unread(userId), [userId]);

  const query = useQuery({
    queryKey: unreadKey,
    queryFn: () => messagesApi.unreadCounts(),
    enabled: Boolean(userId),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  // Receipt acks update the badge through this path too: the chat screen's
  // `messagesApi.markRead` triggers the server's own `message:unread` back to
  // the reader, so opening a thread clears its badge without a round trip.
  useEffect(() => {
    if (!userId || !user) return;
    const applyUnread = (update: MessageUnreadUpdate) => {
      if (update.recipientRole !== user.role) return;
      queryClient.setQueryData<MessageUnreadSummary>(unreadKey, (old) => {
        const items = old?.items ?? [];
        const without = items.filter((item) => item.jobId !== update.jobId);
        return { items: update.unreadCount > 0 ? [...without, update] : without };
      });
    };
    return subscribe('message:unread', applyUnread);
  }, [queryClient, unreadKey, user, userId]);

  const byJob = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of query.data?.items ?? []) map[item.jobId] = item.unreadCount;
    return map;
  }, [query.data]);

  return {
    /** Unread count for one job thread, 0 when clean. */
    countFor: (jobId: string) => byJob[jobId] ?? 0,
    /** Total across all threads — for tab-bar and list badges. */
    total: (query.data?.items ?? []).reduce((sum, item) => sum + item.unreadCount, 0),
  };
}
