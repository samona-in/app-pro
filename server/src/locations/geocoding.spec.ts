import { ApiErrorCode } from '@samona/types';
import { createHttpError } from '../common/errors';
import { createGoogleGeocoder, withGeocodingGuard } from './geocoding';

const GEOCODING_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const PLACES_URL = 'https://places.googleapis.com/v1';

const geocoder = createGoogleGeocoder({
  apiKey: 'test-key',
  geocodingBaseUrl: GEOCODING_URL,
  placesBaseUrl: PLACES_URL,
  timeoutMs: 1000,
});

function mockFetch(payload: unknown, ok = true, status = 200) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok,
    status,
    json: async () => payload,
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const placesSearchResponse = {
  places: [
    {
      id: 'ChIJbenz-circle',
      displayName: { text: 'Benz Circle' },
      formattedAddress: 'Benz Circle, Vijayawada, Andhra Pradesh 520010, India',
      addressComponents: [
        { longText: 'Benz Circle', shortText: 'Benz Circle', types: ['sublocality_level_1'] },
        { longText: 'Vijayawada', shortText: 'Vijayawada', types: ['locality'] },
        { longText: 'Andhra Pradesh', shortText: 'AP', types: ['administrative_area_level_1'] },
        { longText: '520010', shortText: '520010', types: ['postal_code'] },
      ],
      location: { latitude: 16.51, longitude: 80.64 },
    },
  ],
};

const geocodeResponse = {
  status: 'OK',
  results: [
    {
      place_id: 'ChIJmg-road',
      formatted_address: 'MG Road, Hyderabad, Telangana 500001, India',
      address_components: [
        { long_name: 'MG Road', short_name: 'MG Rd', types: ['route'] },
        { long_name: 'Hyderabad', short_name: 'Hyderabad', types: ['locality'] },
        { long_name: 'Telangana', short_name: 'TS', types: ['administrative_area_level_1'] },
        { long_name: '500001', short_name: '500001', types: ['postal_code'] },
      ],
      geometry: { location: { lat: 17.4, lng: 78.5 } },
    },
  ],
};

describe('createGoogleGeocoder', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('search posts to Places (New) and normalizes the places array', async () => {
    const fetchMock = mockFetch(placesSearchResponse);

    const results = await geocoder.search('benz circle', 5);

    expect(fetchMock).toHaveBeenCalledWith(
      `${PLACES_URL}/places:searchText`,
      expect.objectContaining({
        method: 'POST',
        signal: expect.any(AbortSignal),
        headers: expect.objectContaining({
          'X-Goog-Api-Key': 'test-key',
          'X-Goog-FieldMask': expect.stringContaining('places.displayName'),
        }),
        body: JSON.stringify({ textQuery: 'benz circle', maxResultCount: 5, languageCode: 'en' }),
      }),
    );
    expect(results).toEqual([
      {
        formattedAddress: 'Benz Circle, Vijayawada, Andhra Pradesh 520010, India',
        mainLabel: 'Benz Circle',
        secondary: 'Vijayawada, Andhra Pradesh, 520010',
        locality: 'Benz Circle',
        city: 'Vijayawada',
        state: 'Andhra Pradesh',
        postalCode: '520010',
        latitude: 16.51,
        longitude: 80.64,
        placeId: 'ChIJbenz-circle',
      },
    ]);
  });

  it('search returns an empty array when the provider yields no places', async () => {
    mockFetch({});

    await expect(geocoder.search('nowhere', 5)).resolves.toEqual([]);
  });

  it('search clamps the requested limit into the provider-valid range', async () => {
    const fetchMock = mockFetch({});

    await geocoder.search('benz', 99);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ textQuery: 'benz', maxResultCount: 20, languageCode: 'en' }),
      }),
    );
  });

  it('reverse queries the Geocoding API and maps the first result', async () => {
    const fetchMock = mockFetch(geocodeResponse);

    const result = await geocoder.reverse(17.4, 78.5);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`${GEOCODING_URL}?latlng=17.4%2C78.5`),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('key=test-key'),
      expect.anything(),
    );
    expect(result).toEqual({
      formattedAddress: 'MG Road, Hyderabad, Telangana 500001, India',
      mainLabel: 'MG Road',
      secondary: 'Hyderabad, Telangana, 500001',
      locality: null,
      city: 'Hyderabad',
      state: 'Telangana',
      postalCode: '500001',
      latitude: 17.4,
      longitude: 78.5,
      placeId: 'ChIJmg-road',
    });
  });

  it('reverse returns null on ZERO_RESULTS', async () => {
    mockFetch({ status: 'ZERO_RESULTS', results: [] });

    await expect(geocoder.reverse(0, 0)).resolves.toBeNull();
  });

  it('reverse throws when the API reports a non-OK status', async () => {
    mockFetch({ status: 'REQUEST_DENIED', error_message: 'bad key' });

    await expect(geocoder.reverse(1, 2)).rejects.toThrow('REQUEST_DENIED');
  });

  it('details fetches a place by id and normalizes it', async () => {
    const fetchMock = mockFetch(placesSearchResponse.places[0]);

    const result = await geocoder.details('ChIJbenz-circle');

    expect(fetchMock).toHaveBeenCalledWith(
      `${PLACES_URL}/places/ChIJbenz-circle?languageCode=en`,
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Goog-Api-Key': 'test-key' }),
      }),
    );
    expect(result?.placeId).toBe('ChIJbenz-circle');
    expect(result?.mainLabel).toBe('Benz Circle');
  });

  it('throws when the provider answers non-2xx', async () => {
    mockFetch(null, false, 503);

    await expect(geocoder.search('benz', 5)).rejects.toThrow('HTTP 503');
  });

  it('fails clearly when no key is configured', async () => {
    const keyless = createGoogleGeocoder({
      apiKey: '',
      geocodingBaseUrl: GEOCODING_URL,
      placesBaseUrl: PLACES_URL,
      timeoutMs: 1000,
    });
    mockFetch({});

    await expect(keyless.search('benz', 5)).rejects.toThrow('GOOGLE_MAPS_API_KEY');
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
