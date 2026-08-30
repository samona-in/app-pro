import type { ExperienceLevel } from './pro';

/**
 * The order-service lifecycle — mirrors SAMONA__Onboarding_&_Order_Service_
 * Architecture.md §21–§27.
 *
 * A customer files a *service request*; it is not a confirmed Job yet. While
 * the customer has not chosen a pro, its status describes how the request is
 * being surfaced (dispatched as offers, or open to interest). Once the
 * customer selects a pro the same row becomes the confirmed job and moves
 * through the on-site stages.
 *
 * The backend is the only writer. Clients request transitions; they never
 * assert them.
 */

export const ServiceRequestStatus = {
  REQUESTED: 'REQUESTED',
  DISPATCHING: 'DISPATCHING',
  CHOOSING_PRO: 'CHOOSING_PRO',
  OPEN: 'OPEN',
  CONFIRMED: 'CONFIRMED',
  TRAVELLING: 'TRAVELLING',
  ARRIVED: 'ARRIVED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  PAID: 'PAID',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
} as const;

export type ServiceRequestStatus =
  (typeof ServiceRequestStatus)[keyof typeof ServiceRequestStatus];

export const SERVICE_REQUEST_STATUSES = Object.values(ServiceRequestStatus);

/**
 * Allowed forward transitions for a service request.
 *
 * Temporary states (REQUESTED/DISPATCHING/OPEN/CHOOSING_PRO) may lapse to
 * EXPIRED; everyone may cancel. CONFIRMED is the confirmed job, which the
 * selected pro drives on site.
 */
export const SERVICE_REQUEST_TRANSITIONS: Readonly<
  Record<ServiceRequestStatus, readonly ServiceRequestStatus[]>
> = {
  REQUESTED: [ServiceRequestStatus.DISPATCHING, ServiceRequestStatus.CANCELLED, ServiceRequestStatus.EXPIRED],
  DISPATCHING: [ServiceRequestStatus.CHOOSING_PRO, ServiceRequestStatus.OPEN, ServiceRequestStatus.CANCELLED, ServiceRequestStatus.EXPIRED],
  CHOOSING_PRO: [ServiceRequestStatus.CONFIRMED, ServiceRequestStatus.CANCELLED, ServiceRequestStatus.EXPIRED],
  OPEN: [ServiceRequestStatus.CHOOSING_PRO, ServiceRequestStatus.CANCELLED, ServiceRequestStatus.EXPIRED],
  CONFIRMED: [ServiceRequestStatus.TRAVELLING, ServiceRequestStatus.CANCELLED],
  TRAVELLING: [ServiceRequestStatus.ARRIVED, ServiceRequestStatus.CANCELLED],
  ARRIVED: [ServiceRequestStatus.IN_PROGRESS, ServiceRequestStatus.CANCELLED],
  IN_PROGRESS: [ServiceRequestStatus.COMPLETED, ServiceRequestStatus.CANCELLED],
  COMPLETED: [ServiceRequestStatus.PAID],
  PAID: [],
  CANCELLED: [],
  EXPIRED: [],
};

export function canTransitionServiceRequest(
  from: ServiceRequestStatus,
  to: ServiceRequestStatus,
): boolean {
  return SERVICE_REQUEST_TRANSITIONS[from].includes(to);
}

/** Statuses that degenerate the request back to OPEN when no pro is chosen. */
export function isOpenableServiceRequestStatus(status: ServiceRequestStatus): boolean {
  return status === ServiceRequestStatus.REQUESTED || status === ServiceRequestStatus.DISPATCHING;
}

/** Statuses where the customer can still pick a pro. */
export function isSelectableStatus(status: ServiceRequestStatus): boolean {
  return status === ServiceRequestStatus.CHOOSING_PRO || status === ServiceRequestStatus.OPEN;
}

/** A request in one of these gives its selected pro a live, confirmed job. */
export const ACTIVE_JOB_STATUSES: readonly ServiceRequestStatus[] = [
  ServiceRequestStatus.CONFIRMED,
  ServiceRequestStatus.TRAVELLING,
  ServiceRequestStatus.ARRIVED,
  ServiceRequestStatus.IN_PROGRESS,
] as const;

export function isActiveJobStatus(status: ServiceRequestStatus): boolean {
  return (ACTIVE_JOB_STATUSES as readonly ServiceRequestStatus[]).includes(status);
}

export function isTerminalServiceRequestStatus(status: ServiceRequestStatus): boolean {
  return SERVICE_REQUEST_TRANSITIONS[status].length === 0;
}

export const JobOfferStatus = {
  OFFERED: 'OFFERED',
  ACCEPTED: 'ACCEPTED',
  SELECTED: 'SELECTED',
  DECLINED: 'DECLINED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const;

export type JobOfferStatus = (typeof JobOfferStatus)[keyof typeof JobOfferStatus];

export const JOB_OFFER_TRANSITIONS: Readonly<Record<JobOfferStatus, readonly JobOfferStatus[]>> = {
  OFFERED: [JobOfferStatus.ACCEPTED, JobOfferStatus.DECLINED, JobOfferStatus.EXPIRED, JobOfferStatus.CANCELLED],
  ACCEPTED: [JobOfferStatus.SELECTED, JobOfferStatus.CANCELLED],
  SELECTED: [],
  DECLINED: [],
  EXPIRED: [],
  CANCELLED: [],
};

export const ProInterestStatus = {
  INTERESTED: 'INTERESTED',
  SELECTED: 'SELECTED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const;

export type ProInterestStatus = (typeof ProInterestStatus)[keyof typeof ProInterestStatus];

export const PRO_INTEREST_TRANSITIONS: Readonly<
  Record<ProInterestStatus, readonly ProInterestStatus[]>
> = {
  INTERESTED: [ProInterestStatus.SELECTED, ProInterestStatus.REJECTED, ProInterestStatus.EXPIRED, ProInterestStatus.CANCELLED],
  SELECTED: [],
  REJECTED: [],
  EXPIRED: [],
  CANCELLED: [],
};

export const PaymentStatus = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  REFUNDED: 'REFUNDED',
} as const;

export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

/** How a pro entered the customer's shortlist for a request. */
export type ResponderType = 'offer' | 'interest';

// ---------------------------------------------------------------------------
// Wire DTOs shared by both apps and the API.
// ---------------------------------------------------------------------------

export interface ServiceSummaryDto {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
}

/** Summary of a professional, as shown in lists and the shortlist. */
export interface ProSummaryDto {
  proId: string;
  userId: string;
  displayName: string | null;
  rating: number | null;
  completedJobs: number;
  experienceLevel: ExperienceLevel | null;
  distanceKm: number | null;
  estimatedEtaMinutes: number | null;
}

/** One pro on the customer's "choose a pro" shortlist. */
export interface RespondingProDto extends ProSummaryDto {
  respondType: ResponderType;
  /** job_offers.id or pro_interests.id, used by select-pro. */
  responderId: string;
  responderStatus: string;
}

/** Customer identity shown to a pro once the job is confirmed. */
export interface CustomerSummaryDto {
  userId: string;
  displayName: string | null;
  locationLabel: string | null;
}

/** A service request as returned to either party. */
export interface ServiceRequestDto {
  id: string;
  status: ServiceRequestStatus;
  description: string | null;
  photos: string[];
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  selectedProId: string | null;
  estimatedPrice: number | null;
  finalPrice: number | null;
  requestedAt: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  service: ServiceSummaryDto;
  /** Present when the caller is the customer. */
  customer: CustomerSummaryDto | null;
  /** Present for customer reads; the shortlist before selection. */
  respondingPros: RespondingProDto[];
}

/** A pro-facing view of an instant-dispatch offer (incoming job alert). */
export interface JobOfferDto {
  id: string;
  status: JobOfferStatus;
  distanceKm: number;
  estimatedEtaMinutes: number;
  offeredAt: string;
  respondedAt: string | null;
  expiresAt: string | null;
  service: ServiceSummaryDto;
  request: {
    id: string;
    description: string | null;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    estimatedPrice: number | null;
  };
}

/** An open request shown to eligible pros in Available Jobs. */
export interface AvailableJobDto {
  id: string;
  status: ServiceRequestStatus;
  description: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Null when the request has no coordinates to measure against. */
  distanceKm: number | null;
  estimatedEtaMinutes: number | null;
  estimatedPrice: number | null;
  requestedAt: string;
  expiresAt: string | null;
  service: ServiceSummaryDto;
  isInterested: boolean;
}