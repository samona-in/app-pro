import { useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CustomerNotification } from '@samona/types';
import { queryKeys } from '@/constants';
import { notificationsApi } from '@/services/notifications';
import { subscribe } from '@/services/realtime';
import { useSession } from './use-session';

const LIST_LIMIT = 20;

/**
 * The customer's notices, newest first — backs the Notifications modal.
 *
 * REST stays the source of truth (CLAUDE.md "Realtime"); `notification:unread`
 * only moves the bell pill, and the list screen refetches via invalidation
 * whenever a notice is recorded or read.
 */
export function useCustomerNotifications() {
  const { user } = useSession();

  return useQuery({
    queryKey: queryKeys.notifications.list,
    queryFn: () => notificationsApi.list({ limit: LIST_LIMIT }),
    enabled: Boolean(user?.id),
    staleTime: 30_000,
  });
}

/**
 * The bell pill count on the customer's home screen.
 *
 * The REST count initialises it, `notification:unread` moves it live, and a
 * short background refresh back-stops any missed event. Each nudge also
 * invalidates the list so a freshly recorded notice is there the moment the
 * Notifications screen opens.
 */
export function useUnreadNotifications() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const userId = user?.id;
  const unreadKey = useMemo(() => queryKeys.notifications.unread(userId ?? ''), [userId]);

  const query = useQuery({
    queryKey: unreadKey,
    queryFn: () => notificationsApi.unreadCount(),
    enabled: Boolean(userId),
    staleTime: 30_000,
    // The socket nudges only while a recipient is live; polling closes the gap
    // for events that arrived while the bell was unmounted or offline.
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!userId) return;
    return subscribe('notification:unread', (payload) => {
      queryClient.setQueryData(unreadKey, payload);
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list });
    });
  }, [queryClient, unreadKey, userId]);

  return query;
}

/**
 * Marks one notice read (a row tap). Optimistic so the row flips immediately;
 * the bell pill reconciles with the server's own `notification:unread` echo
 * plus the invalidated count query.
 */
export function useMarkNotificationRead() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const unreadKey = useMemo(() => queryKeys.notifications.unread(user?.id ?? ''), [user?.id]);

  return useMutation({
    mutationFn: (notificationId: string) => notificationsApi.markRead(notificationId),
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications.list });
      const prev = queryClient.getQueryData<CustomerNotification[]>(queryKeys.notifications.list);
      queryClient.setQueryData<CustomerNotification[]>(queryKeys.notifications.list, (old) =>
        (old ?? []).map((notice) =>
          notice.id === notificationId && !notice.readAt
            ? { ...notice, readAt: new Date().toISOString() }
            : notice,
        ),
      );
      return { prev };
    },
    onError: (_error, _notificationId, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKeys.notifications.list, ctx.prev);
    },
    onSettled: () => {
      // Even an idempotent second tap re-syncs the pill to the source of truth.
      void queryClient.invalidateQueries({ queryKey: unreadKey });
    },
  });
}
