'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2, ShoppingCart } from 'lucide-react';
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
import {
  draftStatusBadgeClass,
  draftStatusLabel,
  type AdminBookingDraftOverview,
} from '@/lib/drafts';
import { formatDateTime, formatPaise, shortId } from '@/lib/jobs';

/**
 * Booking-cart analytics.
 *
 * A draft is the request a customer was still building. Rows are kept after a
 * cart is booked or abandoned, so the table below shows where interest starts
 * and where it stops — useful for spotting services that attract carts which
 * never convert. Amounts are catalogue estimates, not revenue.
 */
export default function DraftsPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-drafts'],
    queryFn: async () => {
      const res = await api.get<AdminBookingDraftOverview>('/admin/drafts');
      return res.data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading booking carts…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="py-10 text-center text-sm text-red-600">
        {errorMessage(error, 'Could not load booking carts.')}
      </div>
    );
  }

  const { totals } = data;

  const cards = [
    { title: 'In progress', value: totals.active },
    { title: 'Converted to bookings', value: totals.converted },
    { title: 'Abandoned', value: totals.abandoned },
    { title: 'Total carts', value: totals.total },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Booking carts</h1>
          <p className="text-gray-500">
            What customers were assembling before they booked or dropped off. Amounts are
            catalogue estimates.
          </p>
        </div>
        <ShoppingCart className="h-8 w-8 text-gray-300" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>By service</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead className="text-right">In progress</TableHead>
                <TableHead className="text-right">Booked</TableHead>
                <TableHead className="text-right">Abandoned</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.byService.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-gray-500">
                    No saved carts yet.
                  </TableCell>
                </TableRow>
              ) : (
                data.byService.map((service) => (
                  <TableRow key={service.serviceId}>
                    <TableCell className="font-medium">{service.serviceName}</TableCell>
                    <TableCell className="text-right">{service.active}</TableCell>
                    <TableCell className="text-right">{service.converted}</TableCell>
                    <TableCell className="text-right">{service.abandoned}</TableCell>
                    <TableCell className="text-right font-medium">{service.total}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recently updated</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cart</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Works</TableHead>
                <TableHead className="text-right">Estimate</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recent.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-gray-500">
                    No saved carts yet.
                  </TableCell>
                </TableRow>
              ) : (
                data.recent.map((draft) => (
                  <TableRow key={draft.id}>
                    <TableCell className="font-mono text-xs">{shortId(draft.id)}</TableCell>
                    <TableCell>{draft.customerName ?? '—'}</TableCell>
                    <TableCell>{draft.serviceName}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${draftStatusBadgeClass(
                          draft.status,
                        )}`}
                      >
                        {draftStatusLabel(draft.status)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{draft.worksCount}</TableCell>
                    <TableCell className="text-right">
                      {formatPaise(draft.estimatedTotalPaise)}
                    </TableCell>
                    <TableCell>{formatDateTime(draft.updatedAt)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
