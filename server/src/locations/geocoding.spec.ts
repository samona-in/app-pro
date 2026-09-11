import { ApiErrorCode } from '@samona/types';
import { createHttpError } from '../common/errors';
import { createPhotonGeocoder, withGeocodingGuard } from './geocoding';

const BASE_URL = 'https://photon.example';
const geocoder = createPhotonGeocoder({ baseUrl: BASE_URL, timeoutMs: 1000 });

const searchCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [80.64, 16.51] },
      properties: {
        name: 'Benz Circle',
        city: 'Vijayawada',
        state: 'Andhra Pradesh',
        postcode: '520010',
        type: 'city',
      },
    },
  ],
};

const streetFeature = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [78.5, 17.4] },
  properties: { street: 'MG Road', city: 'Hyderabad', country: 'India' },
};

function mockFetch(payload: unknown, ok = true, status = 200) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok,
    status,
    json: async () => payload,
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('createPhotonGeocoder', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('search normalizes a Photon FeatureCollection into suggestions', async () => {
    mockFetch(searchCollection);

    const results = await geocoder.search('benz circle', 5);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`${BASE_URL}/api/?q=benz%20circle&limit=5&lang=en`),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(results).toEqual([
      expect.objectContaining({
        formattedAddress: 'Benz Circle, Vijayawada, Andhra Pradesh, 520010',
        mainLabel: 'Benz Circle',
        secondary: 'Vijayawada, Andhra Pradesh, 520010',
        locality: null,
        city: 'Vijayawada',
        state: 'Andhra Pradesh',
        postalCode: '520010',
        latitude: 16.51,
        longitude: 80.64,
      }),
    ]);
  });

  it('uses the street line as the label when the feature has no name', async () => {
    mockFetch({ type: 'FeatureCollection', features: [streetFeature] });

    const [result] = await geocoder.search('mg road hyderabad', 5);

    expect(result?.mainLabel).toBe('MG Road');
    expect(result?.secondary).toBe('Hyderabad');
  });

  it('reverse returns null when the provider yields nothing', async () => {
    mockFetch({ type: 'FeatureCollection', features: [] });

    const result = await geocoder.reverse(16.51, 80.64);

    expect(result).toBeNull();
  });

  it('throws when the provider answers non-2xx', async () => {
    mockFetch(null, false, 503);

    await expect(geocoder.search('benz', 5)).rejects.toThrow('HTTP 503');
  });
});

describe('withGeocodingGuard', () => {
  it('rethrows provider failures as 502s', async () => {
    await expect(
      withGeocodingGuard('search', () => Promise.reject(new Error('boom'))),
    ).rejects.toMatchObject({
      status: 502,
      code: ApiErrorCode.INTERNAL,
    });
  });

  it('passes successful results through unchanged', async () => {
    await expect(withGeocodingGuard('reverse', () => Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it('never lets the guard swallow a real HttpError it did not create', async () => {
    await expect(
      withGeocodingGuard('search', () => Promise.reject(createHttpError(429, 'RATE_LIMITED', 'no'))),
    ).rejects.toMatchObject({ status: 429 });
  });
});