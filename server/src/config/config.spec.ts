import { loadConfig } from './index';

/** A complete, valid environment; individual tests vary one key at a time. */
const base = {
  NODE_ENV: 'test',
  PORT: '4000',
  DATABASE_URL: 'postgresql://localhost:5432/samona',
  DIRECT_URL: 'postgresql://localhost:5432/samona',
  REDIS_URL: 'redis://localhost:6379',
  SUPABASE_URL: 'https://project.supabase.co',
  S3_REGION: 'us-east-1',
  S3_BUCKET_SELFIES: 'pro-selfies',
  S3_BUCKET_JOB_IMAGES: 'job-images',
  S3_BUCKET_AVATARS: 'avatars',
  S3_BUCKET_DOCUMENTS: 'pro-documents',
  CORS_ORIGINS: '',
} as NodeJS.ProcessEnv;

describe('loadConfig', () => {
  it('accepts a minimal valid environment', () => {
    const config = loadConfig(base);

    expect(config.supabaseUrl).toBe('https://project.supabase.co');
    // No per-role default: the surface is chosen per request, not at boot.
    expect(config.corsOrigins).toEqual([]);
    // Unaccepted jobs do not live forever; 30m open, sweep every 60s.
    expect(config.jobExpireTtlMs).toBe(30 * 60_000);
    expect(config.jobExpireSweepMs).toBe(60_000);
    // Without explicit origins, public object URLs come from the buckets.
    expect(config.s3PublicBaseUrlSelfies).toBeNull();
    expect(config.s3PublicBaseUrlJobImages).toBeNull();
    expect(config.s3PublicBaseUrlAvatars).toBeNull();
  });

  it('treats empty optional values as unset', () => {
    // .env.example ships optional keys as FOO="", which dotenv surfaces as an
    // empty string. An empty URL must not fail validation.
    const config = loadConfig({
      ...base,
      SUPABASE_JWKS_URL: '',
      SUPABASE_JWT_SECRET: '',
      S3_PUBLIC_BASE_URL_SELFIES: '',
      S3_PUBLIC_BASE_URL_JOB_IMAGES: '',
      S3_PUBLIC_BASE_URL_AVATARS: '',
      GOOGLE_MAPS_API_KEY: '',
    });

    expect(config.supabaseJwksUrl).toBeNull();
    expect(config.supabaseJwtSecret).toBeNull();
    expect(config.s3PublicBaseUrlSelfies).toBeNull();
    expect(config.s3PublicBaseUrlJobImages).toBeNull();
    expect(config.s3PublicBaseUrlAvatars).toBeNull();
    expect(config.googleMapsApiKey).toBeNull();
  });

  it('keeps an explicit JWKS URL when one is given', () => {
    const jwks = 'https://project.supabase.co/auth/v1/.well-known/jwks.json';

    expect(loadConfig({ ...base, SUPABASE_JWKS_URL: jwks }).supabaseJwksUrl).toBe(jwks);
  });

  it('refuses to start on a malformed Supabase URL', () => {
    expect(() => loadConfig({ ...base, SUPABASE_URL: 'not-a-url' })).toThrow(/SUPABASE_URL/);
  });

  it('refuses to start when a required value is missing', () => {
    const { DATABASE_URL: _omitted, ...withoutDatabase } = base;

    expect(() => loadConfig(withoutDatabase)).toThrow(/DATABASE_URL/);
  });

  it('refuses to start without bucket names', () => {
    const { S3_BUCKET_AVATARS: _omitted, ...withoutBucket } = base;

    expect(() => loadConfig(withoutBucket)).toThrow(/S3_BUCKET_AVATARS/);

    const { S3_BUCKET_DOCUMENTS: _missing, ...withoutDocuments } = base;

    expect(() => loadConfig(withoutDocuments)).toThrow(/S3_BUCKET_DOCUMENTS/);
  });

  // Each bucket gets its own origin because a CDN distribution fronts exactly
  // one bucket. Setting only some of them must work, so a bucket can be moved
  // to the CDN on its own schedule.
  it('honours a per-bucket public origin independently', () => {
    const config = loadConfig({
      ...base,
      S3_PUBLIC_BASE_URL_SELFIES: 'https://selfies.cdn.example.test',
      S3_PUBLIC_BASE_URL_AVATARS: 'https://avatars.cdn.example.test',
    });

    expect(config.s3PublicBaseUrlSelfies).toBe('https://selfies.cdn.example.test');
    expect(config.s3PublicBaseUrlAvatars).toBe('https://avatars.cdn.example.test');
    expect(config.s3PublicBaseUrlJobImages).toBeNull();
  });

  it('accepts a complete S3-compatible endpoint group', () => {
    const config = loadConfig({
      ...base,
      S3_ENDPOINT: 'https://ref.storage.supabase.co/storage/v1/s3',
      S3_ACCESS_KEY_ID: 'access-key',
      S3_SECRET_ACCESS_KEY: 'secret',
      S3_FORCE_PATH_STYLE: 'true',
    });

    expect(config.s3Endpoint).toBe('https://ref.storage.supabase.co/storage/v1/s3');
    expect(config.s3Credentials).toEqual({ accessKeyId: 'access-key', secretAccessKey: 'secret' });
    expect(config.s3ForcePathStyle).toBe(true);
    // Without the group, the production defaults hold.
    const unset = loadConfig(base);
    expect(unset.s3Endpoint).toBeNull();
    expect(unset.s3Credentials).toBeNull();
    expect(unset.s3ForcePathStyle).toBe(true);
  });

  it('defaults force-path-style to false when opted out', () => {
    const config = loadConfig({
      ...base,
      S3_ENDPOINT: 'https://ref.storage.supabase.co/storage/v1/s3',
      S3_ACCESS_KEY_ID: 'access-key',
      S3_SECRET_ACCESS_KEY: 'secret',
      S3_FORCE_PATH_STYLE: 'false',
    });

    expect(config.s3ForcePathStyle).toBe(false);
  });

  it('rejects a partial S3-compatible endpoint group', () => {
    expect(() =>
      loadConfig({ ...base, S3_ACCESS_KEY_ID: 'access-key', S3_SECRET_ACCESS_KEY: 'secret' }),
    ).toThrow(/S3_ENDPOINT/);
    expect(() =>
      loadConfig({ ...base, S3_ENDPOINT: 'https://ref.storage.supabase.co/storage/v1/s3' }),
    ).toThrow(/S3_ACCESS_KEY_ID/);
  });

  it('treats empty S3-compatible endpoint values as unset', () => {
    const config = loadConfig({
      ...base,
      S3_ENDPOINT: '',
      S3_ACCESS_KEY_ID: '',
      S3_SECRET_ACCESS_KEY: '',
      S3_FORCE_PATH_STYLE: '',
    });

    expect(config.s3Endpoint).toBeNull();
    expect(config.s3Credentials).toBeNull();
  });

  it('splits and trims CORS origins', () => {
    const config = loadConfig({ ...base, CORS_ORIGINS: 'https://a.test, https://b.test ,' });

    expect(config.corsOrigins).toEqual(['https://a.test', 'https://b.test']);
  });
});
