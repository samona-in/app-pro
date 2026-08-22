import { loadConfig } from './index';

/** A complete, valid environment; individual tests vary one key at a time. */
const base = {
  NODE_ENV: 'test',
  PORT: '4000',
  DATABASE_URL: 'postgresql://localhost:5432/samona',
  DIRECT_URL: 'postgresql://localhost:5432/samona',
  REDIS_URL: 'redis://localhost:6379',
  SUPABASE_URL: 'https://project.supabase.co',
  CORS_ORIGINS: '',
} as NodeJS.ProcessEnv;

describe('loadConfig', () => {
  it('accepts a minimal valid environment', () => {
    const config = loadConfig(base);

    expect(config.supabaseUrl).toBe('https://project.supabase.co');
    expect(config.signupDefaultRole).toBe('PRO');
  });

  it('treats empty optional values as unset', () => {
    // .env.example ships optional keys as FOO="", which dotenv surfaces as an
    // empty string. An empty URL must not fail validation.
    const config = loadConfig({
      ...base,
      SUPABASE_JWKS_URL: '',
      SUPABASE_JWT_SECRET: '',
      SUPABASE_SECRET_KEY: '',
      GOOGLE_MAPS_API_KEY: '',
    });

    expect(config.supabaseJwksUrl).toBeNull();
    expect(config.supabaseJwtSecret).toBeNull();
    expect(config.supabaseSecretKey).toBeNull();
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

  it('splits and trims CORS origins', () => {
    const config = loadConfig({ ...base, CORS_ORIGINS: 'https://a.test, https://b.test ,' });

    expect(config.corsOrigins).toEqual(['https://a.test', 'https://b.test']);
  });
});
