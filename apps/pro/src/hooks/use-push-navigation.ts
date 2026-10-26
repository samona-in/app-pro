import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter, useRootNavigationState } from 'expo-router';

interface PushData {
  type?: unknown;
  jobId?: unknown;
}

function chatRouteFor(data: PushData, pathFor: (jobId: string) => string) {
  if (data.type !== 'CHAT_MESSAGE' || typeof data.jobId !== 'string') return null;
  return pathFor(data.jobId);
}

/**
 * Routes notification taps to their screen.
 *
 * Chat pushes carry `type: 'CHAT_MESSAGE'` plus the `jobId`, so tapping one
 * opens the job's thread. Everything else is ignored here — the native Job
 * Alert overlay already owns new-job pushes — and REST, not push, is the
 * source of truth once the screen loads.
 */
export function usePushNavigation(routeFor: (jobId: string) => string) {
  const router = useRouter();
  const navState = useRootNavigationState();
  const isReadyRef = useRef(false);

  useEffect(() => {
    if (navState?.key) {
      isReadyRef.current = true;
    }
  }, [navState?.key]);

  useEffect(() => {
    const openFromResponse = (response: Notifications.NotificationResponse) => {
      if (!isReadyRef.current || !navState?.key) {
        // Defer navigation until router/navigator is ready
        setTimeout(() => openFromResponse(response), 100);
        return;
      }
      try {
        const data = (response.notification.request.content.data ?? {}) as PushData;
        const route = chatRouteFor(data, routeFor);
        if (route) {
          console.log('[usePushNavigation] Navigating from push to', route);
          router.push(route);
        }
      } catch (e) {
        console.warn('[usePushNavigation] Failed to navigate from push response', e);
      }
    };

    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) {
          console.log('[usePushNavigation] Processing last notification response');
          openFromResponse(response);
        }
      })
      .catch((e) => {
        console.warn('[usePushNavigation] getLastNotificationResponseAsync failed', e);
      });
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('[usePushNavigation] Notification response received');
      openFromResponse(response);
    });
    return () => {
      subscription.remove();
    };
  }, [router, routeFor, navState?.key]);
}