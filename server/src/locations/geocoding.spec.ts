import { ApiErrorCode } from '@samona/types';
import { createHttpError } from '../common/errors';
import {
  createFailoverGeocoder,
  createNominatimGeocoder,
  createPhotonGeocoder,
  withGeocodingGuard,
} from './geocoding';
import type { GeocodingProvider } from './geocoding';

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

describe('createNominatimGeocoder', () => {
  const nominatimGeocoder = createNominatimGeocoder({ baseUrl: BASE_URL, timeoutMs: 1000 });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('search queries jsonv2 and normalizes the place array', async () => {
    mockFetch([
      {
        display_name: 'Benz Circle, Vijayawada, Andhra Pradesh 520010, India',
        name: 'Benz Circle',
        lat: '16.51',
        lon: '80.64',
        address: {
          road: 'Benz Circle Road',
          city: 'Vijayawada',
          state: 'Andhra Pradesh',
          postcode: '520010',
        },
      },
    ]);

    const results = await nominatimGeocoder.search('benz circle', 5);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        `${BASE_URL}/search?q=benz%20circle&limit=5&format=jsonv2&accept-language=en`,
      ),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        headers: expect.objectContaining({ 'user-agent': expect.stringContaining('SAMONA') }),
      }),
    );
    expect(results).toEqual([
      expect.objectContaining({
        formattedAddress: 'Benz Circle, Vijayawada, Andhra Pradesh 520010, India',
        mainLabel: 'Benz Circle',
        secondary: 'Vijayawada, Andhra Pradesh, 520010',
        city: 'Vijayawada',
        state: 'Andhra Pradesh',
        postalCode: '520010',
        latitude: 16.51,
        longitude: 80.64,
      }),
    ]);
  });

  it('reverse parses display_name and address', async () => {
    mockFetch({
      display_name: 'MG Road, Hyderabad, Telangana 500001, India',
      lat: '17.4',
      lon: '78.5',
      address: {
        road: 'MG Road',
        city: 'Hyderabad',
        state: 'Telangana',
        postcode: '500001',
      },
    });

    const result = await nominatimGeocoder.reverse(17.4, 78.5);

    expect(result).toEqual(
      expect.objectContaining({
        formattedAddress: 'MG Road, Hyderabad, Telangana 500001, India',
        mainLabel: 'MG Road',
        secondary: 'Hyderabad, Telangana, 500001',
      }),
    );
  });

  it('reverse returns null when the provider yields nothing', async () => {
    mockFetch(null);

    await expect(nominatimGeocoder.reverse(16.51, 80.64)).resolves.toBeNull();
  });
});

describe('createFailoverGeocoder', () => {
  const suggestion = {
    formattedAddress: 'Test Address',
    mainLabel: 'Test',
    secondary: null,
    locality: null,
    city: null,
    state: null,
    postalCode: null,
    latitude: 1,
    longitude: 1,
  };

  const healthy: GeocodingProvider = {
    search: jest.fn().mockResolvedValue([suggestion]),
    reverse: jest.fn().mockResolvedValue(suggestion),
  };

  const down: GeocodingProvider = {
    search: jest.fn().mockRejectedValue(new Error('provider down')),
    reverse: jest.fn().mockRejectedValue(new Error('provider down')),
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses the primary provider when it answers', async () => {
    const failover = createFailoverGeocoder([healthy, down]);

    await expect(failover.search('test', 5)).resolves.toEqual([suggestion]);
    await expect(failover.reverse(1, 2)).resolves.toEqual(suggestion);
    expect(down.search).not.toHaveBeenCalled();
    expect(down.reverse).not.toHaveBeenCalled();
  });

  it('fails over to the next provider when the primary rejects', async () => {
    const failover = createFailoverGeocoder([down, healthy]);

    await expect(failover.search('test', 5)).resolves.toEqual([suggestion]);
    await expect(failover.reverse(1, 2)).resolves.toEqual(suggestion);
    expect(healthy.search).toHaveBeenCalled();
  });

  it('rethrows the last failure when every provider is unavailable', async () => {
    const failover = createFailoverGeocoder([down, down]);

    await expect(failover.search('test', 5)).rejects.toThrow('provider down');
  });

  it('requires at least one provider', () => {
    expect(() => createFailoverGeocoder([])).toThrow('at least one provider');
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
      withGeocodingGuard('search', () =>
        Promise.reject(createHttpError(429, 'RATE_LIMITED', 'no')),
      ),
    ).rejects.toMatchObject({ status: 429 });
  });
});
