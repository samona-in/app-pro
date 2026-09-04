import { JobStatus } from '@samona/types';
import { useIncomingJobStore } from '@/stores/incoming-job';
import { jobNotificationService } from '../job-notifications';

jest.mock('@/services/api', () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));

type Handler = (payload: unknown) => void;
const mockHandlers = new Map<string, Handler>();

jest.mock('@/services/realtime', () => ({
  subscribe: jest.fn((event: string, handler: Handler) => {
    mockHandlers.set(event, handler);
    return () => mockHandlers.delete(event);
  }),
}));

jest.mock('@/services/online-status-state', () => ({
  isOnline: () => true,
  subscribeToOnlineStatus: () => () => {},
}));

jest.mock('@/services/job-alert', () => ({
  startJobAlert: jest.fn().mockResolvedValue(undefined),
  stopJobAlert: jest.fn(),
  isJobAlertPlaying: () => false,
}));

jest.mock('expo-notifications', () => ({
  addNotificationReceivedListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  addNotificationResponseReceivedListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
}));

function statusHandler(): Handler {
  const handler = mockHandlers.get('job:status');
  if (!handler) throw new Error('job:status handler was not registered');
  return handler;
}

describe('jobNotificationService job:status handling', () => {
  beforeEach(() => {
    useIncomingJobStore.setState({ job: null, resolution: null });
    mockHandlers.clear();
    jobNotificationService.setAccepting(null);
  });

  afterEach(() => {
    jobNotificationService.cleanup();
    useIncomingJobStore.setState({ job: null, resolution: null });
  });

  it('resolves the overlay to unavailable when another event claims the job', async () => {
    useIncomingJobStore.getState().show({ id: 'job-1' } as never);
    await jobNotificationService.initialize();

    statusHandler()({ id: 'job-1', status: JobStatus.ACCEPTED } as never);

    expect(useIncomingJobStore.getState().resolution).toBe('unavailable');
  });

  it('does not resolve while this pro is the one accepting the job', async () => {
    useIncomingJobStore.getState().show({ id: 'job-1' } as never);
    await jobNotificationService.initialize();
    jobNotificationService.setAccepting('job-1');

    statusHandler()({ id: 'job-1', status: JobStatus.ACCEPTED } as never);

    expect(useIncomingJobStore.getState().resolution).toBeNull();

    // Once the accept settles, the guard is lifted for the next event.
    jobNotificationService.setAccepting(null);
    statusHandler()({ id: 'job-1', status: JobStatus.ACCEPTED } as never);
    expect(useIncomingJobStore.getState().resolution).toBe('unavailable');
  });
});
