import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ProProfile } from '@samona/types';
import { queryKeys } from '@/constants';
import { api } from '@/services/api';
import { useUpdateServiceRadius } from '../use-service-radius';

jest.mock('@/services/api', () => ({
  api: { patch: jest.fn() },
}));

const patch = api.patch as jest.MockedFunction<typeof api.patch>;

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

/**
 * The Service Areas mutation. It patches the cached profile in place on
 * success and must leave it untouched on failure, so a broken save never
 * masquerades as a committed radius.
 */
describe('useUpdateServiceRadius', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const cacheProfile = (client: QueryClient, overrides: Partial<ProProfile> = {}) => {
    const profile = { id: 'pro_1', serviceRadiusKm: 5, ...overrides } as ProProfile;
    client.setQueryData<ProProfile>(queryKeys.proProfile, profile);
    return profile;
  };

  it('posts to the endpoint and patches the cached profile', async () => {
    patch.mockResolvedValueOnce({ serviceRadiusKm: 20 });
    const { client, wrapper } = makeWrapper();
    cacheProfile(client);

    const { result } = renderHook(() => useUpdateServiceRadius(), { wrapper });

    act(() => result.current.mutate(20));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(patch).toHaveBeenCalledWith('/pros/me/service-radius', { serviceRadiusKm: 20 });
    expect(client.getQueryData<ProProfile>(queryKeys.proProfile)).toMatchObject({
      serviceRadiusKm: 20,
    });
  });

  it('keeps the cache untouched when the save fails', async () => {
    patch.mockRejectedValueOnce(new Error('network down'));
    const { client, wrapper } = makeWrapper();
    const profile = cacheProfile(client);

    const { result } = renderHook(() => useUpdateServiceRadius(), { wrapper });

    act(() => result.current.mutate(25));
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(client.getQueryData<ProProfile>(queryKeys.proProfile)).toBe(profile);
    expect(client.getQueryData<ProProfile>(queryKeys.proProfile)?.serviceRadiusKm).toBe(5);
  });
});