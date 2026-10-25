'use client';

import { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, Loader2, RefreshCw, Search, X } from 'lucide-react';
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
import { formatPaise, shortId, statusBadgeClass, statusLabel, type JobStatus } from '@/lib/jobs';
import {
  LIVE_JOB_STATUSES,
  LIVE_SORT_OPTIONS,
  LIVE_TIME_ZONE,
  expiryState,
  formatAge,
  formatLiveDate,
  formatLiveTime,
  resolveLiveStatuses,
  type AdminLiveResponse,
  type AdminLiveSort,
} from '@/lib/live';

const STATUS_OPTIONS = [
  { value: '', label: "All today's jobs" },
  { value: 'waiting', label: 'Waiting for a pro' },
  { value: 'en_route', label: 'On the way' },
  { value: 'working', label: 'Working' },
  { value: 'payment', label: 'Payment pending' },
  ...LIVE_JOB_STATUSES.map((status) => ({ value: status, label: statusLabel(status) })),
];

const REFRESH_MS = 15_000;

/** The waiting states where `expiresAt` actually matters. */
const WAITING_STATUSES: readonly JobStatus[] = ['REQUESTED', 'OFFERED'];

function LiveContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const status = searchParams.get('status') ?? '';
  const sortParam = searchParams.get('sort') ?? 'newest';
  const sort: AdminLiveSort = LIVE_SORT_OPTIONS.some((option) => option.value === sortParam)
    ? (sortParam as AdminLiveSort)
    : 'newest';
  const q = searchParams.get('q') ?? '';
  const statuses = resolveLiveStatuses(status);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const liveQuery = useQuery({
    queryKey: ['admin-live', { status, sort, q }],
    queryFn: async () => {
      const res = await api.get<AdminLiveResponse>('/admin/live', {
        params: {
          ...(statuses?.length ? { status: statuses.join(',') } : {}),
          sort,
          ...(q ? { q } : {}),
        },
      });
      return res.data;
    },
    // No websockets: a bounded snapshot every 15s is enough to keep the board
    // current and keeps the server free of another long-lived connection.
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true,
  });

  const live = liveQuery.data;
  const summary = live?.summary;
  // Ages and countdowns are measured against the snapshot's own timestamp, so
  // the board never mixes the browser clock with the server's.
  const asOf = live ? Date.parse(live.generatedAt) : Number.NaN;

  const cards = useMemo(
    () => [
      {
        title: 'Waiting for a pro',
        value: summary?.waitingForPro ?? 0,
        icon: Activity,
        tone: 'text-amber-600',
      },
      {
        title: 'On the way',
        value: summary?.enRoute ?? 0,
        icon: Activity,
        tone: 'text-blue-600',
      },
      {
        title: 'In progress',
        value: summary?.inProgress ?? 0,
        icon: Activity,
        tone: 'text-indigo-600',
      },
      {
        title: 'Payment pending',
        value: summary?.paymentPending ?? 0,
        icon: Activity,
        tone: 'text-orange-600',
      },
      {
        title: 'Overdue requests',
        value: summary?.overdue ?? 0,
        icon: AlertTriangle,
        tone: 'text-red-600',
      },
    ],
    [summary],
  );

  const hasFilters = Boolean(status || q || sort !== 'newest');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            Live Operations
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-600" />
              Live
            </span>
          </h1>
          <p className="text-gray-500">
            Today&apos;s open jobs, in {LIVE_TIME_ZONE}. Refreshes every 15 seconds.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <div className="text-right">
            <div className="font-medium text-gray-900">{formatLiveDate(live?.day)}</div>
            <div className="text-xs text-gray-500">
              {live
                ? `${summary?.total ?? 0} open job${summary?.total === 1 ? '' : 's'} · updated ${formatLiveTime(live.generatedAt)}`
                : 'Loading today’s board…'}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void liveQuery.refetch()}
            disabled={liveQuery.isFetching && !liveQuery.isLoading}
            className="gap-1.5"
          >
            {liveQuery.isFetching && !liveQuery.isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                <Icon className={`h-4 w-4 ${card.tone}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{card.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <form
              className="flex items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                setParam('q', String(data.get('q') ?? '').trim());
              }}
            >
              <div className="space-y-1">
                <label htmlFor="live-search" className="text-xs text-gray-500">
                  Search
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                  {/* `key` keeps the box in sync with the URL when filters change. */}
                  <Input
                    key={q}
                    id="live-search"
                    name="q"
                    defaultValue={q}
                    maxLength={80}
                    placeholder="Booking id, phone or name"
                    className="w-64 pl-8"
                  />
                </div>
              </div>
              <Button type="submit" variant="outline">
                Search
              </Button>
            </form>

            <div className="space-y-1">
              <label htmlFor="live-status" className="text-xs text-gray-500">
                Status
              </label>
              <select
                id="live-status"
                value={status}
                onChange={(event) => setParam('status', event.target.value)}
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value || 'all'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="live-sort" className="text-xs text-gray-500">
                Sort
              </label>
              <select
                id="live-sort"
                value={sort}
                onChange={(event) => setParam('sort', event.target.value)}
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
              >
                {LIVE_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {hasFilters ? (
              <Button variant="ghost" onClick={() => router.replace(pathname)} className="gap-1">
                <X className="h-3.5 w-3.5" />
                Clear
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Open jobs today</CardTitle>
        </CardHeader>
        <CardContent>
          {liveQuery.isError ? (
            <div className="py-10 text-center text-sm text-red-600">
              {errorMessage(liveQuery.error, 'Could not load live operations.')}
            </div>
          ) : liveQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading today&apos;s jobs…
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Booking</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Professional</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="text-right">View</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {live?.data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-10 text-center text-gray-500">
                        Nothing open for today with these filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    live?.data.map((job) => {
                      const amount = job.finalPayPaise ?? job.agreedPayPaise ?? job.basePayPaise;
                      const expiry = WAITING_STATUSES.includes(job.status)
                        ? expiryState(job.expiresAt, asOf)
                        : null;

                      return (
                        <TableRow key={job.id}>
                          <TableCell>
                            <Link
                              href={`/dashboard/bookings/${job.id}`}
                              className="font-medium text-[#054DFF] hover:underline"
                            >
                              {shortId(job.id)}
                            </Link>
                            <div className="text-xs text-gray-500">
                              {formatLiveTime(job.createdAt)} · {formatAge(job.createdAt, asOf)} ago
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">
                              {job.customer.displayName || 'Deleted customer'}
                            </div>
                            <div className="text-xs text-gray-500">{job.customer.phone ?? '—'}</div>
                          </TableCell>
                          <TableCell>
                            {job.pro ? (
                              <>
                                <div className="font-medium">
                                  {job.pro.displayName || 'Deleted professional'}
                                </div>
                                <div className="text-xs text-gray-500">{job.pro.phone ?? '—'}</div>
                              </>
                            ) : (
                              <span className="text-sm text-gray-500">Finding a pro</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">{job.service.name}</div>
                            <div className="text-xs text-gray-500">
                              {job.customSkill || job.skill.name}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(job.status)}`}
                            >
                              {statusLabel(job.status)}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm">{formatPaise(amount)}</TableCell>
                          <TableCell>
                            {expiry ? (
                              <span
                                className={`text-sm ${expiry.overdue ? 'font-medium text-red-600' : 'text-gray-700'}`}
                              >
                                {expiry.label}
                              </span>
                            ) : (
                              <span className="text-sm text-gray-400">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Link
                              href={`/dashboard/bookings/${job.id}`}
                              className="text-sm text-[#054DFF] hover:underline"
                            >
                              View
                            </Link>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
                <span>
                  {live?.truncated
                    ? 'Showing the first 200 jobs for today. Narrow the filters to see the rest.'
                    : 'That is everything open for today.'}
                </span>
                {live ? (
                  <span>
                    Last refreshed {formatLiveTime(live.generatedAt)} · {LIVE_TIME_ZONE}
                  </span>
                ) : null}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function LivePage() {
  return (
    <Suspense fallback={<div className="text-sm text-gray-500">Loading live operations…</div>}>
      <LiveContent />
    </Suspense>
  );
}
