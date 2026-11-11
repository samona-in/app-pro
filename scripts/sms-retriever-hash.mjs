#!/usr/bin/env node
/**
 * Computes the 11-character Android SMS Retriever app hash for the SAMONA
 * apps, from the same inputs Google's algorithm uses: the app's application
 * ID plus the signing certificate of the keystore that signs the build.
 *
 *   hash = Base64( SHA-256( `${applicationId} ${hex(DER cert)}` ) ).slice(0, 11)
 *
 * This replicates what `expo-otp-autofill`'s native `AppHashHelper.kt`
 * computes at runtime (`getAppHash()` from `@/hooks` prints it in dev builds).
 * The hash must be embedded in the OTP SMS body or Play Services will not
 * deliver the message to the app — see docs/otp-sms-autofill.md for the
 * Supabase SMS template that carries it.
 *
 * Usage:
 *   node scripts/sms-retriever-hash.mjs
 *
 * Recompute whenever the application ID or the signing certificate changes —
 * most importantly when a real release keystore replaces the debug keystore
 * (both apps currently sign debug and release with the committed
 * `android/app/debug.keystore`; see each app's `android/app/build.gradle`).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The apps' defaults: application id + the keystore that signs their builds. */
const APPS = [
  {
    name: 'customer',
    applicationId: 'in.samona.customer',
    keystore: join(root, 'apps/customer/android/app/debug.keystore'),
    alias: 'androiddebugkey',
    storepass: 'android',
  },
  {
    name: 'pro',
    applicationId: 'in.samona.pro',
    keystore: join(root, 'apps/pro/android/app/debug.keystore'),
    alias: 'androiddebugkey',
    storepass: 'android',
  },
];

/**
 * Exports the certificate in DER form. `keytool` prints a JKS migration
 * warning and a SHA1withRSA notice on stderr; both are harmless here, so
 * stderr is dropped rather than leaking into the output.
 */
function derCertificate(keystore, alias, storepass) {
  return execFileSync(
    'keytool',
    ['-exportcert', '-keystore', keystore, '-storepass', storepass, '-alias', alias],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  );
}

function appHash({ applicationId, keystore, alias, storepass }) {
  const hex = derCertificate(keystore, alias, storepass).toString('hex');
  const digest = createHash('sha256').update(`${applicationId} ${hex}`).digest();
  return digest.toString('base64').slice(0, 11);
}

for (const app of APPS) {
  if (!existsSync(app.keystore)) {
    console.error(`${app.name}: keystore not found at ${app.keystore}`);
    process.exitCode = 1;
    continue;
  }
  console.log(`${app.name} (${app.applicationId}): ${appHash(app)}`);
}
