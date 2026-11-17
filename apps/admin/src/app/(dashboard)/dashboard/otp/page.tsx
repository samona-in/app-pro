'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Loader2, MessageSquare, Search, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, shortId } from '@/lib/jobs';
import {
  OTP_APPS,
  OTP_DELIVERY_STATUSES,
  otpDeviceLabel,
  otpStatusBadgeClass,
  otpStatusLabel,
  type OtpAttemptListResponse,
} from '@/lib/otp';

/** `YYYY-MM-DD` from a date input to the ISO instant the API validates. */
function startOfDay(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function endOfDay(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function OtpContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const app = searchParams.get('app') ?? '';
  const status = searchParams.get('status') ?? '';
  const device = searchParams.get('device') ?? '';
  const phoneLast2 = searchParams.get('phoneLast2') ?? '';
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function clearFilters() {
    router.replace(pathname, { scroll: false });
  }

  const attemptsQuery = useInfiniteQuery({
    queryKey: ['admin-otp-attempts', { app, status, device, phoneLast2, from, to }],
    queryFn: async ({ pageParam }) => {
      const res = await api.get<OtpAttemptListResponse>('/admin/otp-attempts', {
        params: {
          ...(app ? { app } : {}),
          ...(status ? { status } : {}),
          ...(device ? { device } : {}),
          ...(phoneLast2 ? { phoneLast2 } : {}),
          ...(from ? { from: startOfDay(from) } : {}),
          ...(to ? { to: endOfDay(to) } : {}),
          ...(pageParam ? { cursor: pageParam } : {}),
        },
      });
      return res.data;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const attempts = attemptsQuery.data?.pages.flatMap((page) => page.data) ?? [];
  const hasFilters = Boolean(app || status || device || phoneLast2 || from || to);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">OTP Delivery</h1>
          <p className="text-gray-500">Code requests and Twilio delivery outcomes for both apps.</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <MessageSquare className="h-4 w-4" />
          <span>
            {attempts.length} attempt{attempts.length === 1 ? '' : 's'} loaded
          </span>
        </div>
      </div>

      <Card className="border-blue-100 bg-blue-50/60">
        <CardContent className="flex items-start gap-3 pt-4 text-sm text-blue-900">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Read-only diagnostics. Phone numbers are stored only as a keyed hash — the last two
            digits are all that appears here. No OTP values are ever recorded. Not seeing data?
            Delivery telemetry is off unless it has been explicitly enabled for this environment.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <form
              className="flex items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                setParam('device', String(data.get('device') ?? '').trim());
                setParam('phoneLast2', String(data.get('phoneLast2') ?? '').trim());
              }}
            >
              <div className="space-y-1">
                <label htmlFor="otp-device" className="text-xs text-gray-500">
                  Device
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                  <Input
                    key={device}
                    id="otp-device"
                    name="device"
                    defaultValue={device}
                    maxLength={64}
                    placeholder="iQOO, Vivo, Samsung…"
                    className="w-52 pl-8"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label htmlFor="otp-phone" className="text-xs text-gray-500">
                  Phone ends
                </label>
                <Input
                  key={phoneLast2}
                  id="otp-phone"
                  name="phoneLast2"
                  defaultValue={phoneLast2}
                  inputMode="numeric"
                  maxLength={2}
                  placeholder="42"
                  className="w-20"
                />
              </div>
              <Button type="submit" variant="outline">
                Search
              </Button>
            </form>

            <div className="space-y-1">
              <label htmlFor="otp-app" className="text-xs text-gray-500">
                App
              </label>
              <select
                id="otp-app"
                value={app}
                onChange={(event) => setParam('app', event.target.value)}
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
              >
                <option value="">All apps</option>
                {OTP_APPS.map((value) => (
                  <option key={value} value={value}>
                    {value === 'PRO' ? 'Pro' : 'Customer'}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="otp-status" className="text-xs text-gray-500">
                Status
              </label>
              <select
                id="otp-status"
                value={status}
                onChange={(event) => setParam('status', event.target.value)}
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
              >
                <option value="">All statuses</option>
                {OTP_DELIVERY_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {otpStatusLabel(value)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="otp-from" className="text-xs text-gray-500">
                From
              </label>
              <Input
                id="otp-from"
                type="date"
                value={from}
                max={to || undefined}
                onChange={(event) => setParam('from', event.target.value)}
                className="w-40"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="otp-to" className="text-xs text-gray-500">
                To
              </label>
              <Input
                id="otp-to"
                type="date"
                value={to}
                min={from || undefined}
                onChange={(event) => setParam('to', event.target.value)}
                className="w-40"
              />
            </div>

            {hasFilters ? (
              <Button variant="ghost" onClick={clearFilters} className="gap-1">
                <X className="h-3.5 w-3.5" />
                Clear
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Code requests</CardTitle>
        </CardHeader>
        <CardContent>
          {attemptsQuery.isError ? (
            <div className="py-10 text-center text-sm text-red-600">
              {errorMessage(attemptsQuery.error, 'Could not load OTP attempts.')}
            </div>
          ) : attemptsQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading attempts…
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Attempt</TableHead>
                    <TableHead>App</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Events</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attempts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-gray-500">
                        No attempts match these filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    attempts.map((attempt) => (
                      <TableRow key={attempt.id}>
                        <TableCell>
                          <Link
                            href={`/dashboard/otp/${attempt.id}`}
                            className="font-medium text-[#054DFF] hover:underline"
                          >
                            {shortId(attempt.id)}
                          </Link>
                          <div className="text-xs text-gray-500">
                            {formatDateTime(attempt.requestedAt)}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {attempt.app === 'PRO' ? 'Pro' : 'Customer'}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{otpDeviceLabel(attempt)}</div>
                          {attempt.osVersion ? (
                            <div className="text-xs text-gray-500">Android {attempt.osVersion}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-sm">•• {attempt.phoneLast2}</TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${otpStatusBadgeClass(attempt.status)}`}
                          >
                            {otpStatusLabel(attempt.status)}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">{attempt.eventCount}</TableCell>
                        <TableCell className="text-right">
                          <Link
                            href={`/dashboard/otp/${attempt.id}`}
                            className="text-sm text-[#054DFF] hover:underline"
                          >
                            View
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-xs text-gray-500">
                  {attemptsQuery.hasNextPage
                    ? 'More attempts available.'
                    : 'That is the end of the ledger for these filters.'}
                </p>
                {attemptsQuery.hasNextPage ? (
                  <Button
                    variant="outline"
                    onClick={() => void attemptsQuery.fetchNextPage()}
                    disabled={attemptsQuery.isFetchingNextPage}
                  >
                    {attemptsQuery.isFetchingNextPage ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Loading…
                      </>
                    ) : (
                      'Load more'
                    )}
                  </Button>
                ) : null}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function OtpPage() {
  return (
    <Suspense fallback={<div className="text-sm text-gray-500">Loading OTP attempts…</div>}>
      <OtpContent />
    </Suspense>
  );
}
