import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { listNotifications } from '@/services/notifications';
import {
  latestNotificationAt,
  markNotificationsSeen,
  useNotificationsUnread,
} from '../use-notifications-unread';

jest.mock('@/services/notifications', () => ({ listNotifications: jest.fn() }));

const list = listNotifications as jest.Mock;

/**
 * The Pro's bell count is a local watermark: rows newer than the newest row the
 * Pro has opened are unread. These tests pin the two halves of that contract —
 * counting and advancing — because the inbox screen relies on both to clear the
 * badge the moment it is viewed.
 */
describe('Pro notification unread watermark', () => {
  // Far enough ahead that no other test in this file can have advanced past it.
  const NEWEST = '2099-01-02T10:00:00.000Z';
  const OLDER = '2099-01-01T10:00:00.000Z';

  let client: QueryClient;

  beforeEach(() => {
    // One client per test: creating it inside the wrapper would hand every
    // re-render a fresh cache and loop forever. `gcTime: Infinity` also stops
    // React Query's five-minute GC timer from keeping Jest alive.
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
  });

  afterEach(() => {
    client.clear();
  });

  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

  it('picks the newest timestamp regardless of list order', () => {
    expect(latestNotificationAt([{ createdAt: OLDER }, { createdAt: NEWEST }])).toBe(NEWEST);
    expect(latestNotificationAt([])).toBeNull();
  });

  it('counts rows newer than the watermark and clears once they are seen', async () => {
    list.mockResolvedValue([
      { id: 'newest', createdAt: NEWEST },
      { id: 'older', createdAt: OLDER },
    ]);

    const { result } = renderHook(() => useNotificationsUnread(), { wrapper });
    await waitFor(() => expect(result.current).toBe(2));

    await act(async () => {
      await markNotificationsSeen(NEWEST);
    });
    expect(result.current).toBe(0);
  });
});
