import { jobsApi } from '@/services/jobs';
import { useIncomingOffersStore, type PendingOffer } from '@/stores/incoming-offers';
import { clearNativeJobAlert } from '@/services/overlay-alert';
import { offerActions } from '../offer-actions';

jest.mock('@/services/jobs', () => ({
  jobsApi: { accept: jest.fn(), decline: jest.fn() },
}));

jest.mock('@/services/overlay-alert', () => ({
  clearNativeJobAlert: jest.fn().mockResolvedValue(undefined),
  getPendingNativeJobs: jest.fn().mockResolvedValue([]),
}));

const mockAccept = jobsApi.accept as jest.Mock;
const mockDecline = jobsApi.decline as jest.Mock;
const mockClearNativeJobAlert = clearNativeJobAlert as jest.Mock;

function offer(jobId: string): PendingOffer {
  return {
    jobId,
    title: 'Test job',
    serviceName: 'Plumbing',
    serviceCategory: null,
    address: null,
    distanceMeters: null,
    amountPaise: null,
    expiresAt: null,
    offerExpiresAt: null,
    jobOfferToken: null,
    receivedAt: Date.now(),
  };
}

function seedOffers(ids: string[]): void {
  useIncomingOffersStore.setState({
    offersById: Object.fromEntries(ids.map((jobId) => [jobId, offer(jobId)])),
  });
}

function offerIds(): string[] {
  return Object.keys(useIncomingOffersStore.getState().offersById);
}

describe('offerActions.decline', () => {
  beforeEach(() => {
    useIncomingOffersStore.setState({ offersById: {} });
    mockClearNativeJobAlert.mockReset();
    mockDecline.mockReset();
  });

  it('removes only the declined offer once the server confirms', async () => {
    seedOffers(['job-1', 'job-2']);
    mockDecline.mockResolvedValue(undefined);

    await expect(offerActions.decline('job-1')).resolves.toEqual({ status: 'done' });

    expect(mockDecline).toHaveBeenCalledWith('job-1');
    expect(offerIds()).toEqual(['job-2']);
    expect(mockClearNativeJobAlert).toHaveBeenCalledWith('job-1');
  });

  it('keeps the offer when the decline fails', async () => {
    seedOffers(['job-1']);
    mockDecline.mockRejectedValue(new Error('connection lost'));

    const result = await offerActions.decline('job-1');

    expect(result).toEqual({ status: 'error', error: expect.any(Error) });
    expect(offerIds()).toEqual(['job-1']);
    expect(mockClearNativeJobAlert).not.toHaveBeenCalled();
  });

  it('is a busy no-op for a second decline while the first is in flight', async () => {
    seedOffers(['job-1']);
    let settleDecline!: () => void;
    mockDecline.mockReturnValue(
      new Promise<void>((resolve) => {
        settleDecline = resolve;
      }),
    );

    const first = offerActions.decline('job-1');
    await expect(offerActions.decline('job-1')).resolves.toEqual({ status: 'busy' });

    settleDecline();
    await first;

    expect(mockDecline).toHaveBeenCalledTimes(1);
    expect(offerIds()).toEqual([]);
  });
});

describe('offerActions.accept', () => {
  beforeEach(() => {
    useIncomingOffersStore.setState({ offersById: {} });
    mockClearNativeJobAlert.mockReset();
    mockAccept.mockReset();
  });

  it('clears the whole collection when the claim succeeds', async () => {
    seedOffers(['job-1', 'job-2']);
    mockAccept.mockResolvedValue({ id: 'job-1' });

    await expect(offerActions.accept('job-1')).resolves.toEqual({ status: 'done' });

    expect(mockAccept).toHaveBeenCalledWith('job-1');
    expect(offerIds()).toEqual([]);
    expect(mockClearNativeJobAlert).toHaveBeenCalledWith('job-1');
    expect(mockClearNativeJobAlert).toHaveBeenCalledWith('job-2');
  });

  it('drops only the failed offer and leaves the rest actionable', async () => {
    seedOffers(['job-1', 'job-2']);
    mockAccept.mockRejectedValue({ status: 409 });

    const result = await offerActions.accept('job-1');

    expect(result).toEqual({ status: 'error', error: expect.objectContaining({ status: 409 }) });
    expect(offerIds()).toEqual(['job-2']);
    expect(mockClearNativeJobAlert).toHaveBeenCalledWith('job-1');
    expect(mockClearNativeJobAlert).not.toHaveBeenCalledWith('job-2');
  });

  it('is a busy no-op for a second accept while the first is in flight', async () => {
    seedOffers(['job-1']);
    let settleAccept!: (value: unknown) => void;
    mockAccept.mockReturnValue(
      new Promise((resolve) => {
        settleAccept = resolve;
      }),
    );

    const first = offerActions.accept('job-1');
    await expect(offerActions.accept('job-1')).resolves.toEqual({ status: 'busy' });

    settleAccept({ id: 'job-1' });
    await first;

    expect(mockAccept).toHaveBeenCalledTimes(1);
    expect(offerIds()).toEqual([]);
  });
});
