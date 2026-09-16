import { useJobCancellationStore } from '../job-cancellation';
import {
  clearStoredCancellation,
  loadStoredCancellations,
  presentStoredCancellation,
} from '@/services/cancellation-storage';
import { startCancellationVibration, stopCancellationVibration } from '@/utils/cancellation-vibration';

jest.mock('@/services/cancellation-storage', () => ({
  clearStoredCancellation: jest.fn().mockResolvedValue(undefined),
  loadStoredCancellations: jest.fn().mockResolvedValue([]),
  presentStoredCancellation: jest.fn().mockResolvedValue(true),
}));

jest.mock('@/utils/cancellation-vibration', () => ({
  startCancellationVibration: jest.fn(),
  stopCancellationVibration: jest.fn(),
}));

const mockPresent = presentStoredCancellation as jest.Mock;
const mockClear = clearStoredCancellation as jest.Mock;
const mockLoad = loadStoredCancellations as jest.Mock;
const mockStartVibrate = startCancellationVibration as jest.Mock;
const mockStopVibrate = stopCancellationVibration as jest.Mock;

describe('useJobCancellationStore', () => {
  beforeEach(() => {
    useJobCancellationStore.setState({ cancellations: {} });
    jest.clearAllMocks();
  });

  it('raises a customer cancellation and presents it once', async () => {
    expect(await useJobCancellationStore.getState().raise({
      jobId: 'job-1',
      cancelledAt: '2026-09-15T10:00:00.000Z',
      serviceName: 'Electrical',
      showNotification: false,
    })).toBe(true);

    expect(useJobCancellationStore.getState().cancellations['job-1']).toMatchObject({
      jobId: 'job-1',
      cancelledAt: '2026-09-15T10:00:00.000Z',
      serviceName: 'Electrical',
    });
    expect(mockPresent).toHaveBeenCalledWith(
      'job-1',
      '2026-09-15T10:00:00.000Z',
      false,
    );
    expect(mockStartVibrate).toHaveBeenCalledTimes(1);
  });

  it('is idempotent for a re-delivered job — one presentation, no re-vibration', async () => {
    const first = await useJobCancellationStore.getState().raise({
      jobId: 'job-1',
      cancelledAt: '2026-09-15T10:00:00.000Z',
      serviceName: 'Electrical',
      showNotification: false,
    });
    const second = await useJobCancellationStore.getState().raise({
      jobId: 'job-1',
      cancelledAt: '2026-09-15T10:00:00.000Z',
      serviceName: 'Electrical',
      showNotification: true,
    });

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(mockStartVibrate).toHaveBeenCalledTimes(1);
    // The single alert still surfaces once — the modal reads the store, so the
    // duplicate never clears it.
    expect(useJobCancellationStore.getState().cancellations['job-1']).toBeDefined();
  });

  it('keeps an existing richer event (service name) over a bare re-raise', async () => {
    await useJobCancellationStore.getState().raise({
      jobId: 'job-1',
      cancelledAt: '2026-09-15T10:00:00.000Z',
      serviceName: 'Electrical',
      showNotification: false,
    });
    await useJobCancellationStore.getState().raise({
      jobId: 'job-1',
      cancelledAt: '2026-09-15T10:00:00.000Z',
      serviceName: null,
      showNotification: false,
    });

    expect(useJobCancellationStore.getState().cancellations['job-1']!.serviceName).toBe(
      'Electrical',
    );
  });

  it('pick the most recent cancellation for the modal', async () => {
    await useJobCancellationStore.getState().raise({
      jobId: 'job-1',
      cancelledAt: '2026-09-15T09:00:00.000Z',
      serviceName: 'Plumbing',
      showNotification: false,
    });
    await useJobCancellationStore.getState().raise({
      jobId: 'job-2',
      cancelledAt: '2026-09-15T10:00:00.000Z',
      serviceName: 'Electrical',
      showNotification: false,
    });

    expect(useJobCancellationStore.getState().cancellations['job-2']?.serviceName).toBe('Electrical');
    // The store-level selector returns the most recent unacknowledged.
    const state = useJobCancellationStore.getState();
    expect(state.cancellations['job-2']?.cancelledAt).toBe('2026-09-15T10:00:00.000Z');
  });

  it('acknowledges a cancellation across every surface', async () => {
    useJobCancellationStore.setState({
      cancellations: {
        'job-1': {
          jobId: 'job-1',
          cancelledAt: '2026-09-15T10:00:00.000Z',
          serviceName: 'Electrical',
        },
      },
    });

    await useJobCancellationStore.getState().acknowledge('job-1');

    expect(useJobCancellationStore.getState().cancellations['job-1']).toBeUndefined();
    expect(mockClear).toHaveBeenCalledWith('job-1');
    expect(mockStopVibrate).toHaveBeenCalled();
  });

  it('rehydrates native-persisted cancellations without re-presenting them', async () => {
    mockLoad.mockResolvedValue([
      { jobId: 'job-9', cancelledAt: '2026-09-15T10:00:00.000Z' },
    ]);

    await useJobCancellationStore.getState().rehydrateFromNative();

    expect(useJobCancellationStore.getState().cancellations['job-9']).toMatchObject({
      jobId: 'job-9',
      cancelledAt: '2026-09-15T10:00:00.000Z',
    });
    // The native side already presented this alert at delivery.
    expect(mockPresent).not.toHaveBeenCalled();
    expect(mockStartVibrate).not.toHaveBeenCalled();
  });

  it('keeps the richer JS copy when rehydrating a job already in the store', async () => {
    mockLoad.mockResolvedValue([
      { jobId: 'job-1', cancelledAt: '2026-09-15T10:00:00.000Z' },
    ]);
    useJobCancellationStore.setState({
      cancellations: {
        'job-1': {
          jobId: 'job-1',
          cancelledAt: '2026-09-15T10:00:00.000Z',
          serviceName: 'Electrical',
        },
      },
    });

    await useJobCancellationStore.getState().rehydrateFromNative();

    expect(useJobCancellationStore.getState().cancellations['job-1']!.serviceName).toBe('Electrical');
  });
});