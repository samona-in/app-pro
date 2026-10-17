import type { AddressSuggestion } from '@samona/types';
import type { Redis } from '../database/redis';
import { createGeocodeCache, placeCacheKey, reverseCacheKey } from './cache';

const suggestion: AddressSuggestion = {
  formattedAddress: 'Benz Circle, Vijayawada, Andhra Pradesh 520010',
  mainLabel: 'Benz Circle',
  secondary: 'Vijayawada, Andhra Pradesh, 520010',
  locality: null,
  city: 'Vijayawada',
  state: 'Andhra Pradesh',
  postalCode: '520010',
  latitude: 16.51,
  longitude: 80.64,
  placeId: 'ChIJbenz-circle',
};

function fakeRedis(overrides: Partial<Record<'get' | 'set', jest.Mock>> = {}) {
  const redis = {
    get: jest.fn(async () => null as string | null),
    set: jest.fn(async () => 'OK'),
    ...overrides,
  };
  return redis as unknown as Redis & { get: jest.Mock; set: jest.Mock };
}

describe('geocode cache', () => {
  it('round-trips a suggestion through Redis with the configured TTL', async () => {
    const redis = fakeRedis();
    const cache = createGeocodeCache(redis, 1000);

    await cache.set('geo:reverse:1.00000,2.00000', suggestion);

    expect(redis.set).toHaveBeenCalledWith(
      'geo:reverse:1.00000,2.00000',
      JSON.stringify({ v: suggestion }),
      'PX',
      1000,
    );
  });

  it('reports a miss as undefined', async () => {
    const cache = createGeocodeCache(fakeRedis(), 1000);

    await expect(cache.get('geo:place:missing')).resolves.toBeUndefined();
  });

  it('distinguishes a cached "no result" (null) from a miss', async () => {
    const redis = fakeRedis({ get: jest.fn(async () => JSON.stringify({ v: null })) });
    const cache = createGeocodeCache(redis, 1000);

    await expect(cache.get('geo:reverse:0.00000,0.00000')).resolves.toBeNull();
  });

  it('is a no-op without Redis', async () => {
    const cache = createGeocodeCache(null, 1000);

    await expect(cache.get('geo:place:x')).resolves.toBeUndefined();
    await expect(cache.set('geo:place:x', suggestion)).resolves.toBeUndefined();
  });

  it('degrades to a miss when Redis throws on read', async () => {
    const redis = fakeRedis({
      get: jest.fn(async () => {
        throw new Error('redis down');
      }),
    });
    const cache = createGeocodeCache(redis, 1000);

    await expect(cache.get('geo:place:x')).resolves.toBeUndefined();
  });
});

describe('cache keys', () => {
  it('rounds coordinates to ~1 m so the same pin dedupes', () => {
    expect(reverseCacheKey(16.5100001, 80.6400002)).toBe('geo:reverse:16.51000,80.64000');
  });

  it('namespaces place lookups by id', () => {
    expect(placeCacheKey('ChIJbenz-circle')).toBe('geo:place:ChIJbenz-circle');
  });
});
