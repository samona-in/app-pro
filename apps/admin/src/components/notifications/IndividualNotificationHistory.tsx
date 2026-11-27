'use client';

import { useQuery } from '@tanstack/react-query';
import { Clock3, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import type { IndividualNotificationTarget } from './IndividualNotificationCard';

/** Mirrors the admin history response; delivery fields are intentionally absent. */
type AdminNotificationHistoryItem = {
  id: string;
  campaignId: string;
  title: string;
  body: string;
  type: string;
  deepLink: string | null;
  status: string;
  createdAt: string;
  sentAt: string | null;
};

const STATUS_STYLES: Record<string, string> = {
  SENT: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800',
  SKIPPED: 'bg-gray-100 text-gray-800',
  PENDING: 'bg-yellow-100 text-yellow-800',
};

function statusStyle(status: string): string {
  return STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-800';
}

/**
 * Read-only audit of individual notices sent from this admin profile page.
 * Broadcast campaigns deliberately never appear here.
 */
export function IndividualNotificationHistory({
  surface,
  recipientId,
}: Pick<IndividualNotificationTarget, 'surface' | 'recipientId'>) {
  const history = useQuery({
    queryKey: ['admin-notification-history', surface, recipientId],
    queryFn: async () => {
      const response = await api.get(
        `/admin/notifications/recipients/${surface}/${recipientId}/history`,
      );
      return (response.data?.data ?? []) as AdminNotificationHistoryItem[];
    },
    refetchOnWindowFocus: false,
  });

  const items = history.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Clock3 className="h-5 w-5 text-[#054DFF]" />
            Notification history
          </CardTitle>
          <CardDescription>
            Individual notices sent to this profile from the admin app.
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Refresh notification history"
          disabled={history.isFetching}
          onClick={() => void history.refetch()}
        >
          <RefreshCw className={`h-4 w-4 ${history.isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {history.isPending ? (
          <p className="text-sm text-gray-500">Loading notification history…</p>
        ) : history.isError ? (
          <p role="alert" className="text-sm text-red-600">
            Couldn’t load notification history. Try refreshing.
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-500">No individual notifications sent yet.</p>
        ) : (
          <ul className="divide-y">
            {items.map((item) => (
              <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{item.title}</p>
                    <p className="whitespace-pre-wrap break-words text-sm text-gray-600">
                      {item.body}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${statusStyle(item.status)}`}
                  >
                    {item.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                  <span>{new Date(item.sentAt ?? item.createdAt).toLocaleString()}</span>
                  <span>{item.type.replace(/_/g, ' ')}</span>
                  {item.deepLink ? <span className="font-mono">{item.deepLink}</span> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
