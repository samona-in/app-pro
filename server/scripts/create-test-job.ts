import { createHmac } from 'node:crypto';
import { loadConfig } from '../src/config';

process.loadEnvFile('../.env');
const cfg = loadConfig();

const secret = cfg.supabaseJwtSecret;
if (!secret) throw new Error('SUPABASE_JWT_SECRET is not set');

function b64url(s: string): string {
  return Buffer.from(s).toString('base64url');
}

const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
const now = Math.floor(Date.now() / 1000);
const claims = b64url(
  JSON.stringify({
    sub: '60e7c425-0512-42dc-8277-e1c9afb3f6a9',
    phone: '918309671828',
    email: null,
    iss: `${cfg.supabaseUrl.replace(/\/+$/, '')}/auth/v1`,
    aud: 'authenticated',
    iat: now,
    exp: now + 3600,
    role: 'authenticated',
  }),
);
const signingInput = `${header}.${claims}`;
const sig = createHmac('sha256', secret).update(signingInput).digest('base64url');
console.log(`Bearer ${signingInput}.${sig}`);