'use client';

import { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { CalendarSearch, Loader2, Search, X } from 'lucide-react';
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
import {
  ACTIVE_JOB_STATUSES,
  JOB_STATUSES,
  PAST_JOB_STATUSES,
  formatDateTime,
  formatPaise,
  shortId,
  statusBadgeClass,
  statusLabel,
  type AdminJobListResponse,
  type JobStatus,
} from '@/lib/jobs';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'past', label: 'Past' },
  ...JOB_STATUSES.map((status) => ({ value: status, label: statusLabel(status) })),
];

/** Turns the one select value into the statuses the API should filter on. */
function resolveStatuses(value: string): readonly JobStatus[] | undefined {
  if (!value) return undefined;
  if (value === 'active') return ACTIVE_JOB_STATUSES;
  if (value === 'past') return PAST_JOB_STATUSES;
  return JOB_STATUSES.includes(value as JobStatus) ? [value as JobStatus] : undefined;
}

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

function BookingsContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const status = searchParams.get('status') ?? '';
  const serviceId = searchParams.get('serviceId') ?? '';
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  const q = searchParams.get('q') ?? '';

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

  const statuses = resolveStatuses(status);

  const servicesQuery = useQuery({
    // A distinct key from the Services page: that page caches the whole
    // response object under `['admin-services']`, while this one needs the
    // array. Sharing a key would hand back the wrong shape from cache.
    queryKey: ['admin-services', 'bookings-filter'],
    queryFn: async () => {
      const res = await api.get<{ data: Array<{ id: string; name: string }> }>('/admin/services');
      return res.data.data;
    },
  });

  const jobsQuery = useInfiniteQuery({
    queryKey: ['admin-jobs', { status, serviceId, from, to, q }],
    queryFn: async ({ pageParam }) => {
      const res = await api.get<AdminJobListResponse>('/admin/jobs', {
        params: {
          ...(statuses?.length ? { status: statuses.join(',') } : {}),
          ...(serviceId ? { serviceId } : {}),
          ...(from ? { from: startOfDay(from) } : {}),
          ...(to ? { to: endOfDay(to) } : {}),
          ...(q ? { q } : {}),
          ...(pageParam ? { cursor: pageParam } : {}),
        },
      });
      return res.data;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const jobs = useMemo(
    () => jobsQuery.data?.pages.flatMap((page) => page.data) ?? [],
    [jobsQuery.data],
  );

  const hasFilters = Boolean(status || serviceId || from || to || q);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Bookings</h1>
          <p className="text-gray-500">Every job request, in-flight visit and settled payment.</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <CalendarSearch className="h-4 w-4" />
          <span>
            {jobs.length} booking{jobs.length === 1 ? '' : 's'} loaded
          </span>
        </div>
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
                <label htmlFor="booking-search" className="text-xs text-gray-500">
                  Search
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                  {/* `key` remounts the input when the URL's `q` changes from
                      outside, so the box always reflects the active filter. */}
                  <Input
                    key={q}
                    id="booking-search"
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
              <label htmlFor="booking-status" className="text-xs text-gray-500">
                Status
              </label>
              <select
                id="booking-status"
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
              <label htmlFor="booking-service" className="text-xs text-gray-500">
                Service
              </label>
              <select
                id="booking-service"
                value={serviceId}
                onChange={(event) => setParam('serviceId', event.target.value)}
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
              >
                <option value="">All services</option>
                {(servicesQuery.data ?? []).map((service: { id: string; name: string }) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="booking-from" className="text-xs text-gray-500">
                From
              </label>
              <Input
                id="booking-from"
                type="date"
                value={from}
                max={to || undefined}
                onChange={(event) => setParam('from', event.target.value)}
                className="w-40"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="booking-to" className="text-xs text-gray-500">
                To
              </label>
              <Input
                id="booking-to"
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
          <CardTitle>All bookings</CardTitle>
        </CardHeader>
        <CardContent>
          {jobsQuery.isError ? (
            <div className="py-10 text-center text-sm text-red-600">
              {errorMessage(jobsQuery.error, 'Could not load bookings.')}
            </div>
          ) : jobsQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading bookings…
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
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-gray-500">
                        No bookings match these filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    jobs.map((job) => {
                      const amount = job.finalPayPaise ?? job.agreedPayPaise ?? job.basePayPaise;
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
                              {formatDateTime(job.createdAt)}
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

              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-xs text-gray-500">
                  {jobsQuery.hasNextPage
                    ? 'More bookings available.'
                    : 'That is the end of the ledger for these filters.'}
                </p>
                {jobsQuery.hasNextPage ? (
                  <Button
                    variant="outline"
                    onClick={() => void jobsQuery.fetchNextPage()}
                    disabled={jobsQuery.isFetchingNextPage}
                  >
                    {jobsQuery.isFetchingNextPage ? (
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

export default function BookingsPage() {
  return (
    <Suspense fallback={<div className="text-sm text-gray-500">Loading bookings…</div>}>
      <BookingsContent />
    </Suspense>
  );
}
