import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
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

/** The public-read bucket holding job reference photos. */
export const JOB_IMAGES_BUCKET = 'job-images';

/** The public-read bucket holding customer profile avatars. */
export const AVATARS_BUCKET = 'avatars';

/** Mirrors the bucket's `file_size_limit` — reject before the bytes move. */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

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
 * A job reference photo's storage path.
 *
 * The `customerUserId` prefix scopes all of one customer's photos under their
 * own folder, and the random suffix keeps simultaneous uploads from colliding.
 * The path is minted server-side; a client cannot choose where its bytes land
 * and cannot reference another customer's photos.
 */
function jobImagePathFor(customerUserId: string): string {
  return `jobs/${customerUserId}/${randomUUID()}.jpg`;
}

/**
 * An account's avatar storage path.
 *
 * Deterministic — every replace writes through the same path, so a retake
 * overwrites the previous photo instead of leaving orphaned objects behind and
 * the signed upload URL stays valid for as long as the account exists. The
 * path is derived from the verified user id, never from the request body.
 */
function avatarPathFor(userId: string): string {
  return `customers/${userId}/avatar.jpg`;
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
  async function createSelfieUpload(userId: string): Promise<{ path: string; uploadUrl: string }> {
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

  /**
   * Begins the one job-image upload handshake.
   *
   * Mints a unique deterministic-by-scope path for the customer and a signed
   * URL they PUT the image bytes to directly. Nothing in the request body
   * influences the path, so there is no client-controlled location (CLAUDE.md
   * "Security").
   */
  async function createJobImageUpload(
    customerUserId: string,
  ): Promise<{ path: string; uploadUrl: string }> {
    const path = jobImagePathFor(customerUserId);
    const { data, error } = await requireAdmin()
      .storage.from(JOB_IMAGES_BUCKET)
      .createSignedUploadUrl(path, { upsert: true });

    if (error || !data) {
      throw createHttpError(502, ApiErrorCode.INTERNAL, 'Could not start the image upload.', {
        cause: error,
      });
    }

    return { path, uploadUrl: data.signedUrl };
  }

  /**
   * Whether a submitted job-image path points at an object that really
   * reached storage. Used by the jobs domain before it records a path, so a
   * job can never reference a photo that was never uploaded.
   */
  async function jobImageExists(path: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${supabaseUrl}/storage/v1/object/public/${JOB_IMAGES_BUCKET}/${path}`,
        { method: 'HEAD' },
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  /** The public read URL for a stored job image. */
  function jobImagePublicUrl(path: string): string {
    return `${supabaseUrl}/storage/v1/object/public/${JOB_IMAGES_BUCKET}/${path}`;
  }

  /**
   * Mints a signed URL the caller PUTs the avatar bytes to directly.
   *
   * `upsert` lets an avatar replace itself through the deterministic path —
   * retakes overwrite rather than failing or accumulating objects.
   */
  async function createAvatarUpload(userId: string): Promise<{ path: string; uploadUrl: string }> {
    const path = avatarPathFor(userId);
    const { data, error } = await requireAdmin()
      .storage.from(AVATARS_BUCKET)
      .createSignedUploadUrl(path, { upsert: true });

    if (error || !data) {
      throw createHttpError(502, ApiErrorCode.INTERNAL, 'Could not start the photo upload.', {
        cause: error,
      });
    }

    return { path, uploadUrl: data.signedUrl };
  }

  /**
   * Whether the account's avatar is actually in the bucket.
   *
   * The same public-read HEAD probe as the selfie: proves the exact URL we will
   * record resolves to bytes before the profile ever points at it.
   */
  async function avatarExists(userId: string): Promise<boolean> {
    try {
      const response = await fetch(avatarPublicUrl(avatarPathFor(userId)), { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  }

  /** The public read URL for a stored avatar. */
  function avatarPublicUrl(path: string): string {
    return `${supabaseUrl}/storage/v1/object/public/${AVATARS_BUCKET}/${path}`;
  }

  return {
    createSelfieUpload,
    selfieExists,
    selfiePublicUrl,
    selfiePath: selfiePathFor,
    createJobImageUpload,
    jobImageExists,
    jobImagePublicUrl,
    createAvatarUpload,
    avatarExists,
    avatarPublicUrl,
    avatarPath: avatarPathFor,
  };
}

export type StorageService = ReturnType<typeof createStorageService>;
