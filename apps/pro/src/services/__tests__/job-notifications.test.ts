import { JobStatus } from '@samona/types';
import { clearNativeJobAlert, consumeNativePendingAction } from '../overlay-alert';
import { jobNotificationService } from '../job-notifications';
import { useIncomingOffersStore } from '@/stores/incoming-offers';
import { api } from '@/services/api';

const mockApiPost = api.post as jest.Mock;
const mockClearNativeJobAlert = clearNativeJobAlert as jest.Mock;
const mockConsumeNativePendingAction = consumeNativePendingAction as jest.Mock;

jest.mock('@/services/api', () => ({
  api: { post: jest.fn() },
}));

jest.mock('../overlay-alert', () => ({
  clearNativeJobAlert: jest.fn().mockResolvedValue(undefined),
  consumeNativePendingAction: jest.fn().mockResolvedValue(null),
}));

function seedOffers(ids: string[]): void {
  useIncomingOffersStore.setState({
    offersById: Object.fromEntries(
      ids.map((jobId) => [
        jobId,
        {
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
        },
      ]),
    ),
  });
}

function offerIds(): string[] {
  return Object.keys(useIncomingOffersStore.getState().offersById);
}

describe('jobNotificationService native overlay action', () => {
  beforeEach(() => {
    useIncomingOffersStore.setState({ offersById: {} });
    mockClearNativeJobAlert.mockReset();
    mockConsumeNativePendingAction.mockReset();
    mockApiPost.mockReset();
  });

  it('accepts the job and clears the whole pending collection', async () => {
    seedOffers(['job-1', 'job-2']);
    mockApiPost.mockResolvedValue({ id: 'job-1', status: JobStatus.ACCEPTED });

    await jobNotificationService.resolveNativePendingAction('job-1', 'accept');

    expect(mockConsumeNativePendingAction).toHaveBeenCalled();
    expect(mockApiPost).toHaveBeenCalledWith('/jobs/job-1/accept', {});
    expect(offerIds()).toEqual([]);
    expect(mockClearNativeJobAlert).toHaveBeenCalledWith('job-1');
  });

  it('records a decline and drops the offer from every surface', async () => {
    seedOffers(['job-1', 'job-2']);
    mockApiPost.mockResolvedValue(undefined);

    await jobNotificationService.resolveNativePendingAction('job-1', 'decline');

    expect(mockConsumeNativePendingAction).toHaveBeenCalled();
    expect(mockApiPost).toHaveBeenCalledWith('/jobs/job-1/decline', {});
    expect(offerIds()).toEqual(['job-2']);
    expect(mockClearNativeJobAlert).toHaveBeenCalledWith('job-1');
  });

  it('still clears the native alert and drops an unclaimable offer when the accept fails', async () => {
    seedOffers(['job-1']);
    mockApiPost.mockRejectedValue(new Error('transition not allowed'));

    await jobNotificationService.resolveNativePendingAction('job-1', 'accept');

    expect(mockApiPost).toHaveBeenCalledWith('/jobs/job-1/accept', {});
    expect(offerIds()).toEqual([]);
    expect(mockClearNativeJobAlert).toHaveBeenCalledWith('job-1');
  });

  it('keeps the offer when a deep-linked decline fails', async () => {
    seedOffers(['job-1']);
    mockApiPost.mockRejectedValue(new Error('connection lost'));

    await jobNotificationService.resolveNativePendingAction('job-1', 'decline');

    expect(offerIds()).toEqual(['job-1']);
    expect(mockClearNativeJobAlert).toHaveBeenCalledWith('job-1');
  });

  it('executes the action even when no recorded choice was left to consume', async () => {
    seedOffers(['job-4']);
    mockConsumeNativePendingAction.mockResolvedValue(null);
    mockApiPost.mockResolvedValue(undefined);

    await jobNotificationService.resolveNativePendingAction('job-4', 'accept');

    expect(mockConsumeNativePendingAction).toHaveBeenCalled();
    expect(mockApiPost).toHaveBeenCalledWith('/jobs/job-4/accept', {});
    expect(offerIds()).toEqual([]);
  });
});
