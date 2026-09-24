import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { ApiErrorCode } from '@samona/types';
import { createHttpError } from '../common/errors';
import { logger } from '../common/logger';

export interface StorageServiceDeps {
  awsRegion: string;
  bucketSelfies: string;
  bucketJobImages: string;
  bucketAvatars: string;
}

/** The bucket holding live-captured Pro face photos. */
export const SELFIES_BUCKET = 'pro-selfies';

/** Mirrors the expected upload size limit — reject before the bytes move. */
export const SELFIE_MAX_BYTES = 5 * 1024 * 1024;

export const SELFIE_CONTENT_TYPE = 'image/jpeg';

/** The bucket holding job reference photos. */
export const JOB_IMAGES_BUCKET = 'job-images';

/** The bucket holding per-surface profile avatars. */
export const AVATARS_BUCKET = 'avatars';

/** Mirrors the expected upload size limit — reject before the bytes move. */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

/**
 * The surface an avatar belongs to. A person who is both a customer and a
 * professional keeps an independent profile photo for each surface, so avatar
 * objects are scoped under that surface's own folder.
 */
export type AvatarSurface = 'customer' | 'pro';

/** The surface's plural folder prefix, e.g. `customers` or `pros`. */
function avatarFolderFor(surface: AvatarSurface): string {
  return surface === 'pro' ? 'pros' : 'customers';
}

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
 * The folder scope one account's avatars live under, for a given surface.
 *
 * Every avatar object sits below `{surface}s/{userId}/` so the ownership check
 * in the routes is a prefix comparison against the verified user id and the
 * surface chosen by the `X-App-Type` header — the client never chooses where
 * its bytes land.
 */
function avatarScopeFor(surface: AvatarSurface, userId: string): string {
  return `${avatarFolderFor(surface)}/${userId}/`;
}

/**
 * An avatar's storage path.
 *
 * Unique per upload on purpose. A public object URL never changes out from
 * under the caches between the app, the OS and any CDN in front of the bucket,
 * so a retake gets a brand-new URL and no stale-cache layer can ever serve
 * yesterday's bytes. The path is derived from the verified user id, the
 * caller's surface and a server-minted token, never from the request body.
 * The superseded object is deleted when the replace is confirmed, so retakes
 * do not accumulate orphans.
 */
function avatarPathFor(surface: AvatarSurface, userId: string): string {
  return `${avatarScopeFor(surface, userId)}avatar-${randomUUID()}.jpg`;
}

/**
 * Object storage access for domain modules backed by AWS S3.
 *
 * Wraps three small operations so no route talks to the S3 client directly.
 * Uploads never pass through this API's JSON bodies: the client gets a
 * short-lived presigned PUT URL and streams the image straight to S3.
 *
 * Credentials are resolved from the environment automatically by the AWS SDK
 * (EC2 IAM role in production, ~/.aws/credentials locally). No keys are
 * stored in config.
 */
export function createStorageService(deps: StorageServiceDeps) {
  const { awsRegion, bucketSelfies, bucketJobImages, bucketAvatars } = deps;

  const s3 = new S3Client({ region: awsRegion });

  function publicUrl(bucket: string, key: string): string {
    return `https://${bucket}.s3.${awsRegion}.amazonaws.com/${key}`;
  }

  async function createPresignedPut(
    bucket: string,
    key: string,
    contentType: string,
  ): Promise<string> {
    try {
      const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
      return await getSignedUrl(s3, command, { expiresIn: 300 });
    } catch (err) {
      throw createHttpError(502, ApiErrorCode.INTERNAL, 'Could not start the upload.', {
        cause: err,
      });
    }
  }

  async function objectExists(bucket: string, key: string): Promise<boolean> {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Mints a presigned PUT URL the caller uploads the JPEG to directly.
   *
   * The key is deterministic so a retake silently replaces the previous photo.
   * The URL expires in 5 minutes; it is only usable for this one immediate upload.
   */
  async function createSelfieUpload(userId: string): Promise<{ path: string; uploadUrl: string }> {
    const path = selfiePathFor(userId);
    const uploadUrl = await createPresignedPut(bucketSelfies, path, SELFIE_CONTENT_TYPE);
    return { path, uploadUrl };
  }

  /** Whether the selfie object actually exists in S3. */
  async function selfieExists(userId: string): Promise<boolean> {
    return objectExists(bucketSelfies, selfiePathFor(userId));
  }

  function selfiePublicUrl(path: string): string {
    return publicUrl(bucketSelfies, path);
  }

  /**
   * Begins the one job-image upload handshake.
   *
   * Mints a unique path for the customer and a presigned PUT URL they upload
   * the image bytes to directly. Nothing in the request body influences the
   * path, so there is no client-controlled location.
   */
  async function createJobImageUpload(
    customerUserId: string,
  ): Promise<{ path: string; uploadUrl: string }> {
    const path = jobImagePathFor(customerUserId);
    const uploadUrl = await createPresignedPut(bucketJobImages, path, 'image/jpeg');
    return { path, uploadUrl };
  }

  /**
   * Whether a submitted job-image path points at an object that really reached
   * storage. Used by the jobs domain before it records a path.
   */
  async function jobImageExists(path: string): Promise<boolean> {
    return objectExists(bucketJobImages, path);
  }

  function jobImagePublicUrl(path: string): string {
    return publicUrl(bucketJobImages, path);
  }

  /**
   * Mints a presigned PUT URL the caller uploads the avatar bytes to directly.
   *
   * The path is unique to this upload so every completed replace points at an
   * object that has never been fetched before — bypassing stale caches.
   */
  async function createAvatarUpload(
    surface: AvatarSurface,
    userId: string,
  ): Promise<{ path: string; uploadUrl: string }> {
    const path = avatarPathFor(surface, userId);
    const uploadUrl = await createPresignedPut(bucketAvatars, path, 'image/jpeg');
    return { path, uploadUrl };
  }

  /** Whether a submitted avatar path points at an object that really reached storage. */
  async function avatarExists(path: string): Promise<boolean> {
    return objectExists(bucketAvatars, path);
  }

  function avatarPublicUrl(path: string): string {
    return publicUrl(bucketAvatars, path);
  }

  /**
   * Deletes a superseded avatar object, extracting its S3 key from the public
   * URL the profile previously referenced.
   *
   * Best-effort: the replace is already recorded, so a failed delete is an
   * orphaned object, not an integrity problem — but it is logged loudly, never
   * swallowed. URLs outside this bucket are ignored so a stale or foreign value
   * cannot make us remove something we do not own.
   */
  async function removeAvatar(previousPublicUrl: string | null | undefined): Promise<void> {
    const prefix = publicUrl(bucketAvatars, '');
    if (!previousPublicUrl || !previousPublicUrl.startsWith(prefix)) return;

    const key = previousPublicUrl.slice(prefix.length);
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: bucketAvatars, Key: key }));
    } catch (err) {
      logger.error('Avatar cleanup failed; an orphaned object remains.', err);
    }
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
    avatarScope: avatarScopeFor,
    removeAvatar,
  };
}

export type StorageService = ReturnType<typeof createStorageService>;
