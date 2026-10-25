'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Clock,
  ExternalLink,
  ImageIcon,
  Loader2,
  MapPin,
  Phone,
  Star,
  User,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, errorMessage } from '@/lib/api';
import {
  formatDateTime,
  formatPaise,
  shortId,
  statusBadgeClass,
  statusLabel,
  type AdminJobDetail,
  type AdminJobDetailResponse,
  type AdminJobStatusActor,
} from '@/lib/jobs';

/** Human label for the actor behind a status change (never a raw id). */
function statusActorLabel(actor: AdminJobStatusActor): string {
  if (actor.name) return actor.role === 'PRO' ? `${actor.name} (pro)` : actor.name;
  switch (actor.role) {
    case 'PRO':
      return 'Professional';
    case 'CUSTOMER':
      return 'Customer';
    case 'SUPPORT':
      return 'Support';
    default:
      return 'System';
  }
}

/** The dashboard page for the actor, when they have one. */
function statusActorHref(actor: AdminJobStatusActor): string | null {
  if (!actor.id) return null;
  if (actor.role === 'PRO') return `/dashboard/professionals/${actor.id}`;
  if (actor.role === 'CUSTOMER') return `/dashboard/customers/${actor.id}`;
  return null;
}

function StatusActor({ actor }: { actor: AdminJobStatusActor }) {
  const label = statusActorLabel(actor);
  const href = statusActorHref(actor);

  return href ? (
    <Link href={href} className="text-[#054DFF] hover:underline">
      {label}
    </Link>
  ) : (
    <>{label}</>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium text-gray-900">{value}</span>
    </div>
  );
}

function PersonCard({
  title,
  href,
  name,
  phone,
  meta,
  location,
}: {
  title: string;
  href: string;
  name: string;
  phone: string | null;
  meta?: string;
  location: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
            <User className="h-5 w-5 text-gray-500" />
          </div>
          <div>
            <Link href={href} className="font-medium text-[#054DFF] hover:underline">
              {name}
            </Link>
            {meta ? <p className="text-xs text-gray-500">{meta}</p> : null}
          </div>
        </div>
        <div className="space-y-1 text-sm text-gray-700">
          <p className="flex items-center gap-2">
            <Phone className="h-3.5 w-3.5 text-gray-400" />
            {phone ?? '—'}
          </p>
          <p className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 text-gray-400" />
            {location ?? 'No location on file'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function BookingDetail({ job }: { job: AdminJobDetail }) {
  const amount = job.finalPayPaise ?? job.agreedPayPaise ?? job.basePayPaise;
  const customerName = job.customer.displayName || 'Deleted customer';
  const proName = job.pro ? job.pro.displayName || 'Deleted professional' : null;

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/bookings"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to bookings
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">Booking {shortId(job.id)}</h1>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(job.status)}`}
            >
              {statusLabel(job.status)}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {job.service.name} · {job.customSkill || job.skill.name}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-gray-500">Settled amount</p>
          <p className="text-2xl font-bold">{formatPaise(amount)}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Job details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">What was requested</p>
                <p className="mt-1 whitespace-pre-line text-sm text-gray-800">{job.description}</p>
              </div>

              <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
                <DetailRow
                  label="Place"
                  value={
                    job.placeType === 'OTHER'
                      ? job.placeDescription || 'Other'
                      : job.placeType.replace(/_/g, ' ').toLowerCase()
                  }
                />
                <DetailRow label="Location" value={job.locationLabel ?? '—'} />
                <DetailRow label="Created" value={formatDateTime(job.createdAt)} />
                <DetailRow label="Accepted" value={formatDateTime(job.acceptedAt)} />
                <DetailRow label="Completed" value={formatDateTime(job.completedAt)} />
                <DetailRow label="Cancelled" value={formatDateTime(job.cancelledAt)} />
                <DetailRow label="Base pay" value={formatPaise(job.basePayPaise)} />
                <DetailRow label="Agreed pay" value={formatPaise(job.agreedPayPaise)} />
                <DetailRow label="Final pay" value={formatPaise(job.finalPayPaise)} />
                <DetailRow label="Expires" value={formatDateTime(job.expiresAt)} />
              </div>

              {job.latitude !== null && job.longitude !== null ? (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${job.latitude},${job.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-[#054DFF] hover:underline"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  Open work location in Maps
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : null}

              {job.imageUrls.length > 0 ? (
                <div>
                  <p className="flex items-center gap-1 text-xs uppercase tracking-wide text-gray-500">
                    <ImageIcon className="h-3.5 w-3.5" />
                    Reference photos
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {job.imageUrls.map((url) => (
                      <a key={url} href={url} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt="Job reference"
                          className="h-28 w-28 rounded-lg object-cover ring-1 ring-black/10"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {job.statusHistory.length === 0 ? (
                <p className="text-sm text-gray-500">No status changes recorded.</p>
              ) : (
                <ol className="space-y-4">
                  {job.statusHistory.map((entry) => (
                    <li key={entry.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span className="mt-1.5 h-2 w-2 rounded-full bg-[#054DFF]" />
                        <span className="mt-1 h-full w-px bg-gray-200" />
                      </div>
                      <div className="pb-1">
                        <p className="text-sm font-medium">
                          {entry.fromStatus
                            ? `${statusLabel(entry.fromStatus)} → ${statusLabel(entry.toStatus)}`
                            : statusLabel(entry.toStatus)}
                        </p>
                        <p className="flex items-center gap-1 text-xs text-gray-500">
                          <Clock className="h-3 w-3" />
                          {formatDateTime(entry.createdAt)}
                          {entry.changedBy.role === 'SYSTEM' ? (
                            ' · system'
                          ) : (
                            <>
                              {' · by '}
                              <StatusActor actor={entry.changedBy} />
                            </>
                          )}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Offers &amp; declines</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  Offers sent ({job.offers.length})
                </p>
                {job.offers.length === 0 ? (
                  <p className="mt-1 text-sm text-gray-500">No offers were sent.</p>
                ) : (
                  <ul className="mt-2 divide-y">
                    {job.offers.map((offer) => (
                      <li
                        key={offer.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                      >
                        <span>Pro {shortId(offer.proId)}</span>
                        <span className="text-xs text-gray-500">
                          {offer.outcome ?? 'Pending'} · sent {formatDateTime(offer.createdAt)}
                          {offer.consumedAt
                            ? ` · actioned ${formatDateTime(offer.consumedAt)}`
                            : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  Declines ({job.declines.length})
                </p>
                {job.declines.length === 0 ? (
                  <p className="mt-1 text-sm text-gray-500">No declines recorded.</p>
                ) : (
                  <ul className="mt-2 divide-y">
                    {job.declines.map((decline) => (
                      <li
                        key={decline.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                      >
                        <span>Pro {shortId(decline.proId)}</span>
                        <span className="text-xs text-gray-500">
                          {formatDateTime(decline.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Identifiers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <DetailRow label="Booking id" value={<code className="text-xs">{job.id}</code>} />
              <DetailRow
                label="Service id"
                value={<code className="text-xs">{job.service.id}</code>}
              />
              <DetailRow label="Start code" value="Hidden" />
              <DetailRow label="Failed start attempts" value={job.startOtpAttempts} />
            </CardContent>
          </Card>

          <PersonCard
            title="Customer"
            href={`/dashboard/customers/${job.customer.id}`}
            name={customerName}
            phone={job.customer.profile.phone}
            meta={job.customer.profile.isActive ? 'Active account' : 'Inactive account'}
            location={job.customer.locationLabel}
          />

          {job.pro ? (
            <PersonCard
              title="Professional"
              href={`/dashboard/professionals/${job.pro.id}`}
              name={proName ?? 'Deleted professional'}
              phone={job.pro.profile.phone}
              meta={[
                job.pro.isOnline ? 'Online' : 'Offline',
                job.pro.isVerified ? 'Verified' : 'Unverified',
                job.pro.rating !== null ? `${job.pro.rating.toFixed(1)} rating` : null,
                `${job.pro.completedJobs} jobs`,
              ]
                .filter(Boolean)
                .join(' · ')}
              location={job.pro.locationLabel}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Professional</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500">No professional has accepted this job yet.</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Money</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailRow label="Customer committed" value={formatPaise(job.basePayPaise)} />
              <DetailRow label="Agreed with pro" value={formatPaise(job.agreedPayPaise)} />
              <DetailRow label="Settled" value={formatPaise(job.finalPayPaise)} />
              <p className="mt-3 flex items-center gap-1 text-xs text-gray-500">
                <Star className="h-3 w-3" />
                Payments are cash-only; settlement is the Paid transition.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function BookingDetailContent() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-job', id],
    queryFn: async () => {
      const res = await api.get<AdminJobDetailResponse>(`/admin/jobs/${id}`);
      return res.data;
    },
    enabled: Boolean(id),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading booking…
      </div>
    );
  }

  if (isError || !data?.data) {
    return (
      <div className="space-y-4">
        <Link
          href="/dashboard/bookings"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to bookings
        </Link>
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {errorMessage(error, 'Could not load this booking.')}
        </div>
      </div>
    );
  }

  return <BookingDetail job={data.data} />;
}

/**
 * `useParams` is runtime-only, so it must sit inside a Suspense boundary for
 * the route to prerender under `cacheComponents` (same shape as the other
 * `[id]` dashboard pages).
 */
export default function BookingDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading booking…
        </div>
      }
    >
      <BookingDetailContent />
    </Suspense>
  );
}
