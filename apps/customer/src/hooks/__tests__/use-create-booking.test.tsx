import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { JobDetail } from '@samona/types';
import { queryKeys } from '@/constants';
import { bookingApi } from '@/services/bookings';
import { useCreateBooking } from '../use-bookings';

jest.mock('@/services/api', () => ({ api: { get: jest.fn() } }));
jest.mock('@/services/bookings', () => ({ bookingApi: { create: jest.fn() } }));

const mockCreate = bookingApi.create as jest.MockedFunction<typeof bookingApi.create>;

/** Enough of a job for the list/detail cache assertions. */
function job(id: string): JobDetail {
  return { id } as JobDetail;
}

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useCreateBooking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('inserts the created job into the cached list so the active-job hint can render', async () => {
    const existing = job('job-1');
    const created = job('job-2');
    queryClient.setQueryData(queryKeys.bookings.list(), [existing]);
    mockCreate.mockResolvedValue(created);

    const { result } = renderHook(() => useCreateBooking(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({} as never);
    });

    expect(queryClient.getQueryData(queryKeys.bookings.list())).toEqual([created, existing]);
    expect(queryClient.getQueryData(queryKeys.bookings.detail(created.id))).toEqual(created);
  });

  it('starts the list with the created job when nothing was cached', async () => {
    const created = job('job-3');
    mockCreate.mockResolvedValue(created);

    const { result } = renderHook(() => useCreateBooking(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({} as never);
    });

    expect(queryClient.getQueryData(queryKeys.bookings.list())).toEqual([created]);
  });

  it('upserts instead of duplicating a job already in the list', async () => {
    const stale = job('job-4');
    const created = { ...job('job-4'), status: 'OFFERED' } as JobDetail;
    queryClient.setQueryData(queryKeys.bookings.list(), [stale]);
    mockCreate.mockResolvedValue(created);

    const { result } = renderHook(() => useCreateBooking(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({} as never);
    });

    expect(queryClient.getQueryData(queryKeys.bookings.list())).toEqual([created]);
  });
});
