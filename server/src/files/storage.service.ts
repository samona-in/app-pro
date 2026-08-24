import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ApiErrorCode } from '@samona/types';
import { createHttpError } from '../common/errors';

export interface StorageServiceDeps {
  supabaseUrl: string;
  /** Service key. Without it no upload URL can be minted and uploads fail. */
  supabaseSecretKey: string | null;
}

/** The public-read bucket holding live-captured Pro face photos. */
export const SELFIES_BUCKET = 'pro-selfies';

/** Mirrors the bucket's `file_size_limit` — reject before the bytes move. */
export const SELFIE_MAX_BYTES = 5 * 1024 * 1024;

export const SELFIE_CONTENT_TYPE = 'image/jpeg';

/**
 * The storage path for an account's selfie.
 *
 * Deterministic on purpose: a retake overwrites the previous photo instead of
 * accumulating orphaned objects, and because the path is derived from the
 * verified user id, no client input ever chooses where bytes land.
 */
function selfiePathFor(userId: string): string {
  return `pros/${userId}/selfie.jpg`;
}

/**
 * Object storage access for domain modules.
 *
 * Wraps Supabase Storage behind three small operations so no route talks to
 * the storage client directly. Uploads never pass through this API's JSON
 * bodies (app.ts enforces that): the client gets a short-lived signed upload
 * URL and streams the image straight to the bucket.
 */
export function createStorageService(deps: StorageServiceDeps) {
  const { supabaseUrl, supabaseSecretKey } = deps;

  const admin: SupabaseClient | null = supabaseSecretKey
    ? createClient(supabaseUrl, supabaseSecretKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

  function requireAdmin(): SupabaseClient {
    if (!admin) {
      throw createHttpError(
        500,
        ApiErrorCode.INTERNAL,
        'File storage is not configured on this deployment.',
      );
    }
    return admin;
  }

  function selfiePublicUrl(path: string): string {
    return `${supabaseUrl}/storage/v1/object/public/${SELFIES_BUCKET}/${path}`;
  }

  /**
   * Mints a signed URL the caller PUTs the JPEG to directly.
   *
   * `upsert` allows a retake to replace the previous photo through the same
   * deterministic path rather than failing on it. The URL expires quickly
   * (storage's default), so it is only usable for this one immediate upload.
   */
  async function createSelfieUpload(
    userId: string,
  ): Promise<{ path: string; uploadUrl: string }> {
    const path = selfiePathFor(userId);
    const { data, error } = await requireAdmin()
      .storage.from(SELFIES_BUCKET)
      .createSignedUploadUrl(path, { upsert: true });

    if (error || !data) {
      throw createHttpError(502, ApiErrorCode.INTERNAL, 'Could not start the photo upload.', {
        cause: error,
      });
    }

    return { path, uploadUrl: data.signedUrl };
  }

  /**
   * Whether the object is actually in the bucket.
   *
   * The bucket is public-read, so a HEAD on the public URL is the existence
   * probe — no extra credential round-trip, and it proves the exact URL we
   * will hand out resolves to bytes.
   */
  async function selfieExists(userId: string): Promise<boolean> {
    try {
      const response = await fetch(selfiePublicUrl(selfiePathFor(userId)), { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  }

  return { createSelfieUpload, selfieExists, selfiePublicUrl, selfiePath: selfiePathFor };
}

export type StorageService = ReturnType<typeof createStorageService>;
