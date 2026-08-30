import type { PrismaClient } from '../database/prisma';
import type { MatchingService } from '../matching/matching.service';
import { ExperienceLevel, JobOfferStatus, ServiceRequestStatus } from '@samona/types';
import { REALTIME_EVENTS, type RealtimeService } from '../realtime/gateway';
import { createJobsService } from './jobs.service';

const REQUEST_ID = '11111111-1111-1111-1111-111111111111';
const CUSTOMER_ID = '22222222-2222-2222-2222-222222222222';
const SERVICE_ID = '33333333-3333-3333-3333-333333333333';

type ProRef = {
  id: string;
  userId: string;
  displayName: string | null;
  experienceLevel: ExperienceLevel | null;
  rating: number | null;
  completedJobs: number;
  latitude: number | null;
  longitude: number | null;
};

type Row = {
  id: string;
  customerId: string;
  serviceId: string;
  status: ServiceRequestStatus;
  description: string | null;
  photos: string[];
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  selectedProId: string | null;
  estimatedPrice: number | null;
  finalPrice: number | null;
  requestedAt: Date;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  service: { id: string; slug: string; name: string; icon: string };
  customer: { displayName: string | null; locationLabel: string | null };
  selectedPro: ProRef | null;
  offers: Array<{
    id: string;
    status: JobOfferStatus;
    distanceKm: number | null;
    estimatedEtaMinutes: number | null;
    pro: ProRef;
  }>;
  interests: Array<{ id: string; status: ServiceRequestStatus; pro: ProRef }>;
};

const pro: ProRef = {
  id: '44444444-4444-4444-4444-444444444444',
  userId: '55555555-5555-5555-5555-555555555555',
  displayName: 'Ravi',
  experienceLevel: ExperienceLevel.FIVE_TO_TEN,
  rating: 4.7,
  completedJobs: 12,
  latitude: 12.9719,
  longitude: 77.5943,
};

/** A full `requestSummarySelect` row, the read shape shared across the API. */
function makeRow(overrides: Partial<Row> = {}): Row {
  const now = new Date();
  return {
    id: REQUEST_ID,
    customerId: CUSTOMER_ID,
    serviceId: SERVICE_ID,
    status: ServiceRequestStatus.REQUESTED,
    description: 'Fix the leaking kitchen tap.',
    photos: [],
    latitude: 12.9716,
    longitude: 77.5946,
    address: 'Indiranagar, Bengaluru',
    selectedProId: null,
    estimatedPrice: 2500,
    finalPrice: null,
    requestedAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    createdAt: now,
    updatedAt: now,
    service: { id: SERVICE_ID, slug: 'plumbing', name: 'Plumbing', icon: '🔧' },
    customer: { displayName: 'Aisha', locationLabel: 'Indiranagar' },
    selectedPro: null,
    offers: [],
    interests: [],
    ...overrides,
  };
}

function fakeRealtime() {
  const emitToUser = jest.fn();
  const emitToUsers = jest.fn();
  return {
    calls: { emitToUser, emitToUsers },
    client: { attach: jest.fn(), emitToUser, emitToUsers, close: jest.fn() } as unknown as RealtimeService,
  };
}

function fakePrisma() {
  const calls = {
    customerProfile: { findUnique: jest.fn() },
    service: { findFirst: jest.fn() },
    proProfile: { findUnique: jest.fn() },
    serviceRequest: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findFirstOrThrow: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    jobOffer: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    proInterest: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
    jobStatusHistory: { create: jest.fn() },
    payment: { upsert: jest.fn() },
  };
  const transaction = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(calls));
  const client = {
    ...calls,
    $transaction: transaction,
  } as unknown as PrismaClient;
  return { calls, transaction, client };
}

function service(prisma: PrismaClient, realtime: RealtimeService, matching?: Partial<MatchingService>) {
  return createJobsService({
    prisma,
    realtime,
    matching: {
      findEligiblePros: jest.fn(),
      isProEligible: jest.fn(),
      ...matching,
    } as unknown as MatchingService,
  });
}

const CUSTOMER = '22222222-2222-2222-2222-222222222222';
const PRO_USER = pro.userId;

afterEach(() => jest.resetAllMocks());

describe('createServiceRequest', () => {
  it('dispatches offers to eligible pros and notifies everyone', async () => {
    const prisma = fakePrisma();
    const realtime = fakeRealtime();
    const matching = { findEligiblePros: jest.fn().mockResolvedValue([pro]) };
    const jobs = service(prisma.client, realtime.client, matching);
    prisma.calls.customerProfile.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.calls.service.findFirst.mockResolvedValue({ id: SERVICE_ID });
    prisma.calls.serviceRequest.create.mockResolvedValue(makeRow());
    prisma.calls.serviceRequest.findFirstOrThrow.mockResolvedValue(
      makeRow({ status: ServiceRequestStatus.DISPATCHING, selectedPro: pro, offers: [] }),
    );
    prisma.calls.jobOffer.create.mockImplementation(async ({ data }: any) => ({ id: 'o1', ...data }));

    const dto = await jobs.createServiceRequest(CUSTOMER, {
      serviceId: SERVICE_ID,
      description: 'Leaking tap',
      latitude: 12.9716,
      longitude: 77.5946,
    });

    expect(dto.status).toBe(ServiceRequestStatus.DISPATCHING);
    expect(prisma.calls.jobOffer.create).toHaveBeenCalledTimes(1);
    const [matchingArgs] = (matching.findEligiblePros as jest.Mock).mock.calls[0];
    expect(matchingArgs).toMatchObject({ serviceId: SERVICE_ID, latitude: 12.9716, longitude: 77.5946 });
    expect(realtime.calls.emitToUser).toHaveBeenCalledWith(CUSTOMER, REALTIME_EVENTS.REQUEST_STATUS, dto);
    expect(realtime.calls.emitToUser).toHaveBeenCalledWith(PRO_USER, REALTIME_EVENTS.JOB_OFFER, expect.objectContaining({ id: 'o1' }));
  });

  it('opens the request instead of dispatching when there is no location', async () => {
    const prisma = fakePrisma();
    const realtime = fakeRealtime();
    const jobs = service(prisma.client, realtime.client);
    prisma.calls.customerProfile.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.calls.service.findFirst.mockResolvedValue({ id: SERVICE_ID });
    prisma.calls.serviceRequest.create.mockResolvedValue(makeRow({ latitude: null, longitude: null }));
    prisma.calls.serviceRequest.findFirstOrThrow.mockResolvedValue(
      makeRow({ latitude: null, longitude: null, status: ServiceRequestStatus.OPEN }),
    );

    const dto = await jobs.createServiceRequest(CUSTOMER, {
      serviceId: SERVICE_ID,
      description: 'Leaking tap',
    });

    expect(dto.status).toBe(ServiceRequestStatus.OPEN);
    expect(prisma.calls.jobOffer.create).not.toHaveBeenCalled();
    expect(realtime.calls.emitToUser).toHaveBeenCalledWith(CUSTOMER, REALTIME_EVENTS.REQUEST_STATUS, dto);
    expect(realtime.calls.emitToUser).not.toHaveBeenCalledWith(PRO_USER, REALTIME_EVENTS.JOB_OFFER, expect.anything());
  });

  it('blocks a customer with no profile', async () => {
    const prisma = fakePrisma();
    const realtime = fakeRealtime();
    const jobs = service(prisma.client, realtime.client);
    prisma.calls.customerProfile.findUnique.mockResolvedValue(null);

    await expect(jobs.createServiceRequest(CUSTOMER, { serviceId: SERVICE_ID })).rejects.toMatchObject({
      status: 403,
    });
  });
});

describe('respondToOffer', () => {
  const dispatchRow = makeRow({
    status: ServiceRequestStatus.DISPATCHING,
    customer: { displayName: 'Aisha', locationLabel: 'Indiranagar' },
  });
  const offer = {
    id: 'o1',
    status: JobOfferStatus.OFFERED,
    offeredAt: new Date(),
    respondedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    serviceRequest: dispatchRow,
  };

  it('accepts and moves the request to choosing', async () => {
    const prisma = fakePrisma();
    const realtime = fakeRealtime();
    const jobs = service(prisma.client, realtime.client);
    prisma.calls.proProfile.findUnique.mockResolvedValue({ id: pro.id, latitude: 12.9719, longitude: 77.5943 });
    prisma.calls.jobOffer.findFirst.mockResolvedValue(offer);
    prisma.calls.serviceRequest.count.mockResolvedValue(0);
    prisma.calls.serviceRequest.findFirst.mockResolvedValue(
      makeRow({ status: ServiceRequestStatus.CHOOSING_PRO }),
    );
    prisma.calls.serviceRequest.findFirstOrThrow.mockResolvedValue(dispatchRow);

    const result = await jobs.respondToOffer(PRO_USER, 'o1', 'accept');

    expect(result).toEqual({ offerStatus: JobOfferStatus.ACCEPTED, requestId: dispatchRow.id });
    expect(prisma.calls.jobOffer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: JobOfferStatus.ACCEPTED, respondedAt: expect.any(Date) } }),
    );
    expect(realtime.calls.emitToUser).toHaveBeenCalledWith(CUSTOMER, REALTIME_EVENTS.REQUEST_STATUS, expect.anything());
    expect(realtime.calls.emitToUser).toHaveBeenCalledWith(PRO_USER, REALTIME_EVENTS.JOB_OFFER_STATUS, {
      id: 'o1',
      offerStatus: 'ACCEPTED',
    });
  });

  it('rejects an already-answered offer', async () => {
    const prisma = fakePrisma();
    const realtime = fakeRealtime();
    const jobs = service(prisma.client, realtime.client);
    prisma.calls.proProfile.findUnique.mockResolvedValue({ id: pro.id, latitude: null, longitude: null });
    prisma.calls.jobOffer.findFirst.mockResolvedValue({ ...offer, status: JobOfferStatus.DECLINED });

    await expect(jobs.respondToOffer(PRO_USER, 'o1', 'accept')).rejects.toMatchObject({ status: 409 });
  });
});

describe('transitionJob', () => {
  it('completes the job, anchors the price and records a pending payment', async () => {
    const prisma = fakePrisma();
    const realtime = fakeRealtime();
    const jobs = service(prisma.client, realtime.client);
    prisma.calls.proProfile.findUnique.mockResolvedValue({ id: pro.id, latitude: null, longitude: null });
    prisma.calls.serviceRequest.findFirst.mockResolvedValue(
      makeRow({ status: ServiceRequestStatus.IN_PROGRESS, selectedProId: pro.id }),
    );
    prisma.calls.serviceRequest.findFirstOrThrow.mockResolvedValue(
      makeRow({ status: ServiceRequestStatus.COMPLETED, finalPrice: 2500, selectedProId: pro.id }),
    );

    const dto = await jobs.transitionJob(PRO_USER, REQUEST_ID, 'complete');

    expect(dto.status).toBe(ServiceRequestStatus.COMPLETED);
    expect(dto.finalPrice).toBe(2500);
    expect(prisma.calls.serviceRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { finalPrice: 2500 } }),
    );
    expect(prisma.calls.payment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { serviceRequestId: REQUEST_ID, amount: 2500, status: 'PENDING' },
      }),
    );
    expect(realtime.calls.emitToUser).toHaveBeenCalledWith(CUSTOMER, REALTIME_EVENTS.REQUEST_STATUS, dto);
    expect(realtime.calls.emitToUser).toHaveBeenCalledWith(CUSTOMER, REALTIME_EVENTS.PAYMENT_STATUS, dto);
  });

  it('refuses to complete a job that is not assigned to the pro', async () => {
    const prisma = fakePrisma();
    const realtime = fakeRealtime();
    const jobs = service(prisma.client, realtime.client);
    prisma.calls.proProfile.findUnique.mockResolvedValue({ id: pro.id, latitude: null, longitude: null });
    prisma.calls.serviceRequest.findFirst.mockResolvedValue(null);

    await expect(jobs.transitionJob(PRO_USER, REQUEST_ID, 'complete')).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('cancelServiceRequest', () => {
  it('does not cancel a completed job', async () => {
    const prisma = fakePrisma();
    const realtime = fakeRealtime();
    const jobs = service(prisma.client, realtime.client);
    prisma.calls.serviceRequest.findFirst.mockResolvedValue(
      makeRow({ status: ServiceRequestStatus.COMPLETED, selectedProId: pro.id }),
    );

    await expect(jobs.cancelServiceRequest(CUSTOMER, REQUEST_ID)).rejects.toMatchObject({ status: 409 });
  });
});