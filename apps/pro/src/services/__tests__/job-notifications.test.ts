import { JobStatus } from '@samona/types';
import { useIncomingJobStore } from '@/stores/incoming-job';
import { jobNotificationService } from '../job-notifications';
import { api } from '@/services/api';

const mockApiGet = api.get as jest.Mock;

/** Drives the mocked online-status-state for one test. */
function setOnlineStatus(online: boolean, known: boolean): void {
  mockOnlineStatus.__set(online, known);
}

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

// Mutable so tests can exercise the cold-start (unknown) gate vs a known state.
// The `mock` prefix is required by jest's factory scope rule.
const mockOnlineStatus = {
  online: true,
  known: true,
  __set(online: boolean, known: boolean): void {
    this.online = online;
    this.known = known;
  },
};

jest.mock('@/services/online-status-state', () => {
  return {
    isOnline: () => mockOnlineStatus.online,
    isOnlineStatusKnown: () => mockOnlineStatus.known,
    reconcileOnlineStatus: (serverOnline: boolean) => {
      mockOnlineStatus.__set(serverOnline, true);
    },
    subscribeToOnlineStatus: () => () => {},
  };
});

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
    useIncomingJobStore.setState({ job: null, pendingJobs: [], resolution: null });
    mockHandlers.clear();
    mockApiGet.mockReset();
    jobNotificationService.setAccepting(null);
    setOnlineStatus(true, true);
  });

  afterEach(() => {
    jobNotificationService.cleanup();
    useIncomingJobStore.setState({ job: null, pendingJobs: [], resolution: null });
  });

  it('resolves the overlay to unavailable when another event claims the job', async () => {
    useIncomingJobStore.getState().enqueue({ id: 'job-1' } as never);
    await jobNotificationService.initialize();

    statusHandler()({ id: 'job-1', status: JobStatus.ACCEPTED } as never);

    expect(useIncomingJobStore.getState().resolution).toBe('unavailable');
  });

  it('does not resolve while this pro is the one accepting the job', async () => {
    useIncomingJobStore.getState().enqueue({ id: 'job-1' } as never);
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

describe('jobNotificationService cold-start alert gate', () => {
  beforeEach(() => {
    useIncomingJobStore.setState({ job: null, pendingJobs: [], resolution: null });
    mockApiGet.mockReset();
    setOnlineStatus(true, true);
  });

  afterEach(() => {
    jobNotificationService.cleanup();
    useIncomingJobStore.setState({ job: null, pendingJobs: [], resolution: null });
  });

  it('drops the alert immediately when the pro is known to be offline', async () => {
    setOnlineStatus(false, true);
    await jobNotificationService.initialize();

    await jobNotificationService.handleJobNotification('job-offline');

    // No server round-trip and nothing enqueued: a known-offline pro never rings.
    expect(mockApiGet).not.toHaveBeenCalled();
    expect(useIncomingJobStore.getState().job).toBeNull();
    expect(useIncomingJobStore.getState().pendingJobs).toHaveLength(0);
  });

  it('does not ring a stale alert when a cold start resolves to offline', async () => {
    setOnlineStatus(false, false); // cold start: launch default, not yet known
    mockApiGet.mockResolvedValue({ isOnline: false });
    await jobNotificationService.initialize();

    await jobNotificationService.handleJobNotification('job-stale');

    // The server was asked, said offline, and the alert was dropped.
    expect(mockApiGet).toHaveBeenCalledWith('/pros/me');
    expect(useIncomingJobStore.getState().job).toBeNull();
    expect(useIncomingJobStore.getState().pendingJobs).toHaveLength(0);
  });

  it('raises the alert on a cold start once the server confirms the pro is online', async () => {
    setOnlineStatus(false, false); // cold start: launch default, not yet known
    mockApiGet.mockImplementation((path: string) =>
      path === '/pros/me'
        ? Promise.resolve({ isOnline: true })
        : Promise.resolve({ id: path.replace('/jobs/', ''), status: JobStatus.REQUESTED }),
    );
    await jobNotificationService.initialize();

    await jobNotificationService.handleJobNotification('job-cold');

    // Server truth resolved to online, the job was fetched and enqueued.
    expect(mockApiGet).toHaveBeenCalledWith('/pros/me');
    expect(useIncomingJobStore.getState().job?.id).toBe('job-cold');
  });
});
