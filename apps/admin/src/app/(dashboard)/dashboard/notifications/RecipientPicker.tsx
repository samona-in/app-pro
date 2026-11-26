'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';

export type RecipientSurface = 'PRO' | 'CUSTOMER';

export interface NotificationRecipient {
  id: string;
  userId: string | null;
  surface: RecipientSurface;
  name: string;
  phone: string | null;
  isOnline: boolean | null;
  isVerified: boolean | null;
}

export async function findNotificationRecipients(params: {
  surface: RecipientSurface;
  q?: string;
  recipientId?: string;
}): Promise<NotificationRecipient[]> {
  const response = await api.get('/admin/notifications/recipients', { params });
  return response.data?.data ?? [];
}

function recipientDetails(recipient: NotificationRecipient): string {
  const details = [recipient.phone ?? 'No phone'];
  if (recipient.isOnline !== null) details.push(recipient.isOnline ? 'Online' : 'Offline');
  if (recipient.isVerified !== null)
    details.push(recipient.isVerified ? 'Verified' : 'Not verified');
  return details.join(' · ');
}

export function RecipientPicker({
  surface,
  selected,
  onSelect,
}: {
  surface: RecipientSurface;
  selected: NotificationRecipient | null;
  onSelect: (recipient: NotificationRecipient | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const results = useQuery({
    queryKey: ['admin-notification-recipients', surface, search],
    queryFn: () => findNotificationRecipients({ surface, q: search }),
    enabled: search.length > 0,
    staleTime: 30_000,
  });

  return (
    <div className="space-y-3 rounded-lg border bg-white p-4">
      <div className="space-y-2">
        <Label htmlFor="recipient-search">
          Search {surface === 'PRO' ? 'professional' : 'customer'} by name, phone or user ID
        </Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            id="recipient-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={surface === 'PRO' ? 'Name, phone or user ID' : 'Name, phone or user ID'}
            className="pl-9"
            autoComplete="off"
          />
        </div>
      </div>

      {selected ? (
        <div className="flex items-start justify-between gap-3 rounded-md border border-[#054DFF]/30 bg-[#054DFF]/5 p-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1 text-sm font-semibold text-gray-900">
              <Check className="h-4 w-4 shrink-0 text-[#054DFF]" />
              <span className="truncate">{selected.name}</span>
            </p>
            <p className="mt-0.5 truncate text-xs text-gray-600">{recipientDetails(selected)}</p>
            <p className="mt-0.5 truncate font-mono text-[11px] text-gray-500">
              ID {selected.id}
              {selected.userId ? ` · User ${selected.userId}` : ''}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Clear selected recipient"
            onClick={() => onSelect(null)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      {search ? (
        <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border">
          {results.isFetching ? (
            <p className="p-3 text-sm text-gray-500">Searching…</p>
          ) : results.isError ? (
            <p className="p-3 text-sm text-red-600">Couldn’t search recipients. Try again.</p>
          ) : !results.data || results.data.length === 0 ? (
            <p className="p-3 text-sm text-gray-500">
              No matching {surface === 'PRO' ? 'professionals' : 'customers'}.
            </p>
          ) : (
            results.data.map((recipient) => {
              const active = selected?.id === recipient.id;
              return (
                <button
                  key={recipient.id}
                  type="button"
                  onClick={() => onSelect(recipient)}
                  aria-pressed={active}
                  className={`flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-gray-50 ${
                    active ? 'bg-[#054DFF]/5' : ''
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-gray-900">
                      {recipient.name}
                    </span>
                    <span className="block truncate text-xs text-gray-500">
                      {recipientDetails(recipient)}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-gray-400">
                      {recipient.id}
                    </span>
                  </span>
                  {active ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#054DFF]" /> : null}
                </button>
              );
            })
          )}
        </div>
      ) : (
        <p className="text-xs text-gray-500">
          Type at least one character. Exactly one recipient can be selected.
        </p>
      )}
    </div>
  );
}
