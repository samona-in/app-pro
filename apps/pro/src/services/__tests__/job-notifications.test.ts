import { JobStatus } from '@samona/types';
import { clearNativeJobAlert, consumeNativePendingAction } from '../overlay-alert';
import { jobNotificationService } from '../job-notifications';
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

type Handler = (payload: unknown) => void;
const mockHandlers = new Map<string, Handler>();

jest.mock('@/services/realtime', () => ({
  subscribe: jest.fn((event: string, handler: Handler) => {
    mockHandlers.set(event, handler);
    return () => mockHandlers.delete(event);
  }),
}));

function statusHandler(): Handler {
  const handler = mockHandlers.get('job:status');
  if (!handler) throw new Error('job:status handler was not registered');
  return handler;
}

describe('jobNotificationService job:status cleanup', () => {
  beforeEach(() => {
    mockHandlers.clear();
    mockClearNativeJobAlert.mockReset();
    mockConsumeNativePendingAction.mockReset();
    mockApiPost.mockReset();
  });

  afterEach(() => {
    jobNotificationService.cleanup();
  });

  it('clears the native alert when realtime says a queued job was claimed', async () => {
    await jobNotificationService.initialize();
    statusHandler()({ id: 'job-1', status: JobStatus.ACCEPTED } as never);
    expect(mockClearNativeJobAlert).toHaveBeenCalledWith('job-1');
  });

  it('clears the native alert for a cancelled job', async () => {
    await jobNotificationService.initialize();
    statusHandler()({ id: 'job-2', status: JobStatus.CANCELLED } as never);
    expect(mockClearNativeJobAlert).toHaveBeenCalledWith('job-2');
  });

  it('ignores events for jobs that remain open', async () => {
    await jobNotificationService.initialize();
    statusHandler()({ id: 'job-3', status: JobStatus.REQUESTED } as never);
    expect(mockClearNativeJobAlert).not.toHaveBeenCalled();
  });

  it('is idempotent across initialize/cleanup cycles', async () => {
    await jobNotificationService.initialize();
    await jobNotificationService.initialize();
    expect(mockHandlers.get('job:status')).toBeDefined();

    jobNotificationService.cleanup();
    expect(mockHandlers.get('job:status')).toBeUndefined();

    await jobNotificationService.initialize();
    expect(mockHandlers.get('job:status')).toBeDefined();
  });
});

describe('jobNotificationService native overlay action', () => {
  beforeEach(() => {
    mockHandlers.clear();
    mockClearNativeJobAlert.mockReset();
    mockConsumeNativePendingAction.mockReset();
    mockApiPost.mockReset();
  });

  afterEach(() => {
    jobNotificationService.cleanup();
  });

  it('accepts the job with the secured token and clears the native alert', async () => {
    mockApiPost.mockResolvedValue({ id: 'job-1', status: JobStatus.ACCEPTED });

    await jobNotificationService.resolveNativePendingAction('job-1', 'accept');

    expect(mockConsumeNativePendingAction).toHaveBeenCalled();
    expect(mockApiPost).toHaveBeenCalledWith('/jobs/job-1/accept', {});
    expect(mockClearNativeJobAlert).toHaveBeenCalledWith('job-1');
  });

  it('records a decline and drops the native alert', async () => {
    mockApiPost.mockResolvedValue(undefined);

    await jobNotificationService.resolveNativePendingAction('job-2', 'decline');

    expect(mockConsumeNativePendingAction).toHaveBeenCalled();
    expect(mockApiPost).toHaveBeenCalledWith('/jobs/job-2/decline', {});
    expect(mockClearNativeJobAlert).toHaveBeenCalledWith('job-2');
  });

  it('clears the native alert even when the accept fails', async () => {
    mockApiPost.mockRejectedValue(new Error('transition not allowed'));

    await jobNotificationService.resolveNativePendingAction('job-3', 'accept');

    expect(mockApiPost).toHaveBeenCalledWith('/jobs/job-3/accept', {});
    expect(mockClearNativeJobAlert).toHaveBeenCalledWith('job-3');
  });

  it('executes the action even when no recorded choice was left to consume', async () => {
    mockConsumeNativePendingAction.mockResolvedValue(null);
    mockApiPost.mockResolvedValue(undefined);

    await jobNotificationService.resolveNativePendingAction('job-4', 'accept');

    expect(mockConsumeNativePendingAction).toHaveBeenCalled();
    expect(mockApiPost).toHaveBeenCalledWith('/jobs/job-4/accept', {});
    expect(mockClearNativeJobAlert).toHaveBeenCalledWith('job-4');
  });
});