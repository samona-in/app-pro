'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/jobs';
import {
  otpDeviceLabel,
  otpEventLabel,
  otpStatusBadgeClass,
  otpStatusLabel,
  type OtpAttemptDetailResponse,
} from '@/lib/otp';

function OtpAttemptDetailContent() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const attemptQuery = useQuery({
    queryKey: ['admin-otp-attempt', id],
    queryFn: async () => {
      const res = await api.get<OtpAttemptDetailResponse>(`/admin/otp-attempts/${id}`);
      return res.data.data;
    },
    enabled: Boolean(id),
  });

  if (attemptQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading attempt…
      </div>
    );
  }

  if (attemptQuery.isError || !attemptQuery.data) {
    return (
      <div className="space-y-4">
        <Link
          href="/dashboard/otp"
          className="inline-flex items-center gap-1 text-sm text-[#054DFF]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to OTP Delivery
        </Link>
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {errorMessage(attemptQuery.error, 'Could not load this attempt.')}
        </div>
      </div>
    );
  }

  const attempt = attemptQuery.data;

  const facts: Array<{ label: string; value: string }> = [
    { label: 'Requested', value: formatDateTime(attempt.requestedAt) },
    { label: 'App', value: attempt.app === 'PRO' ? 'Pro' : 'Customer' },
    { label: 'Device', value: otpDeviceLabel(attempt) },
    { label: 'OS version', value: attempt.osVersion ?? '—' },
    { label: 'Phone', value: `•• ${attempt.phoneLast2}` },
    { label: 'Last event', value: formatDateTime(attempt.lastEventAt) },
    { label: 'Verification SID', value: attempt.verificationSid ?? '—' },
    { label: 'Attempt SID', value: attempt.attemptSid ?? '—' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Link
            href="/dashboard/otp"
            className="inline-flex items-center gap-1 text-sm text-[#054DFF]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to OTP Delivery
          </Link>
          <h1 className="text-2xl font-bold">OTP attempt {attempt.id.slice(0, 8)}</h1>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${otpStatusBadgeClass(attempt.status)}`}
            >
              {otpStatusLabel(attempt.status)}
            </span>
            <span className="text-sm text-gray-500">{attempt.eventCount} delivery events</span>
          </div>
        </div>
      </div>

      <Card className="border-blue-100 bg-blue-50/60">
        <CardContent className="flex items-start gap-3 pt-4 text-sm text-blue-900">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Read-only diagnostics. Only the last two phone digits are shown, and no OTP value is
            stored anywhere in this ledger.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Attempt</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt className="text-xs text-gray-500">{fact.label}</dt>
                <dd className="mt-1 break-all text-sm font-medium">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delivery events</CardTitle>
        </CardHeader>
        <CardContent>
          {attempt.deliveryEvents.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              No Twilio delivery events arrived for this attempt. Check that the Message Status
              Stream and client registration are enabled.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Network</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Event time</TableHead>
                  <TableHead>Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attempt.deliveryEvents.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>
                      <div className="text-sm font-medium">{otpEventLabel(event.eventType)}</div>
                      <div className="text-xs text-gray-500">{event.eventType}</div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${otpStatusBadgeClass(event.status)}`}
                      >
                        {otpStatusLabel(event.status)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {event.mcc || event.mnc ? `${event.mcc ?? '—'} / ${event.mnc ?? '—'}` : '—'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {event.channel ?? '—'}
                      {event.numberSegments ? (
                        <span className="text-xs text-gray-500"> · {event.numberSegments} seg</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm">{formatDateTime(event.eventTime)}</TableCell>
                    <TableCell className="text-sm">{formatDateTime(event.receivedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * `useParams` is runtime-only, so it must sit inside a Suspense boundary for
 * the route to prerender under `cacheComponents` (same shape as the other
 * `[id]` dashboard pages).
 */
export default function OtpAttemptDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading attempt…
        </div>
      }
    >
      <OtpAttemptDetailContent />
    </Suspense>
  );
}
