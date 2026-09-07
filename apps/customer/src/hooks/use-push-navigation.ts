import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';

interface PushData {
  type?: unknown;
  jobId?: unknown;
}

function chatRouteFor(data: PushData, routeFor: (jobId: string) => string) {
  if (data.type !== 'CHAT_MESSAGE' || typeof data.jobId !== 'string') return null;
  return routeFor(data.jobId);
}

/**
 * Routes notification taps to their screen.
 *
 * Chat pushes carry `type: 'CHAT_MESSAGE'` plus the `jobId`, so tapping one
 * opens the job's thread. Everything else is ignored here, and REST, not push,
 * is the source of truth once the screen loads.
 */
export function usePushNavigation(routeFor: (jobId: string) => string) {
  const router = useRouter();

  useEffect(() => {
    const openFromResponse = (response: Notifications.NotificationResponse) => {
      const data = (response.notification.request.content.data ?? {}) as PushData;
      const route = chatRouteFor(data, routeFor);
      if (route) router.push(route);
    };

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openFromResponse(response);
    });
    const subscription = Notifications.addNotificationResponseReceivedListener(openFromResponse);
    return () => {
      subscription.remove();
    };
  }, [router, routeFor]);
}