import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { ApiErrorCode } from '@samona/types';
import { createHttpError } from '../common/errors';
import { logger } from '../common/logger';

/** Every object is a JPEG: the app encodes in-app before it ever asks for a URL. */
const IMAGE_CONTENT_TYPE = 'image/jpeg';

/**
 * How long a minted upload URL stays usable.
 *
 * Long enough for a slow connection to move a few megabytes, far too short for
 * a leaked URL to still be useful. The ticket is single-use in practice: the
 * path is either unique per upload, or an overwrite of one the caller owns.
 */
const UPLOAD_URL_TTL_SECONDS = 300;

/**
 * Mints a presigned URL for one upload.
 *
 * Injected so tests can drive the handshake without a signing backend; the
 * default is the AWS SDK's own signer, which needs no credentials of its own
 * because the client resolves them from the ambient provider chain.
 */
export type SignUploadUrl = (
  command: PutObjectCommand,
  options: { expiresIn: number },
) => Promise<string>;

export interface StorageServiceDeps {
  /** Region the buckets live in, e.g. `us-east-1`. */
  region: string;
  /** Bucket holding live-captured Pro face photos. */
  selfiesBucket: string;
  /** Bucket holding job reference photos. */
  jobImagesBucket: string;
  /** Bucket holding per-surface profile avatars. */
  avatarsBucket: string;
  /**
   * Origins public object URLs are built from, per bucket. E.g.
   * `{ selfies: 'https://d111.cloudfront.net' }`.
   *
   * One per bucket rather than one shared value, because that is how the world
   * actually works: a CDN distribution fronts exactly one bucket origin, so
   * selfies, job images and avatars each need their own host. A single shared
   * base could only ever be right if all three buckets were served from the same
   * prefix, which is not something a CDN gives us. Each field is optional and
   * falls back to its own bucket's regional S3 URL.
   */
  publicBaseUrls: {
    selfies: string | null;
    jobImages: string | null;
    avatars: string | null;
  };
  /**
   * The S3 client. Credential-free in production — it resolves credentials from
   * the ambient provider chain, which on Fargate is the task role, so no key
   * material lives in the environment.
   */
  s3: S3Client;
  /** Overrides the URL signer. Defaults to the AWS SDK's own. */
  signUploadUrl?: SignUploadUrl;
}

/** Largest selfie the API will accept, in bytes. */
export const SELFIE_MAX_BYTES = 5 * 1024 * 1024;

/** Largest job reference photo the API will accept, in bytes. */
export const JOB_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/** Largest avatar the API will accept, in bytes. */
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
 * yesterday's bytes (CLAUDE.md "UI"). The path is derived from the verified
 * user id, the caller's surface and a server-minted token, never from the
 * request body. The superseded object is deleted when the replace is
 * confirmed, so retakes do not accumulate orphans.
 */
function avatarPathFor(surface: AvatarSurface, userId: string): string {
  return `${avatarScopeFor(surface, userId)}avatar-${randomUUID()}.jpg`;
}

/**
 * Object storage access for domain modules.
 *
 * Wraps Amazon S3 behind three small operations so no route talks to the
 * storage client directly. Uploads never pass through this API's JSON bodies
 * (app.ts enforces that): the client gets a short-lived signed upload URL and
 * streams the image straight to the bucket.
 */
export function createStorageService(deps: StorageServiceDeps) {
  const { region, selfiesBucket, jobImagesBucket, avatarsBucket, publicBaseUrls, s3 } = deps;
  const sign = deps.signUploadUrl ?? ((command, options) => getSignedUrl(s3, command, options));

  /**
   * Resolves one bucket's public origin, preferring a configured CDN/custom
   * origin and falling back to the bucket's own regional S3 URL.
   *
   * Trailing slashes are stripped so `https://d111.cloudfront.net/` cannot
   * produce a double-slashed key. That is not cosmetic: `removeAvatar` matches
   * on this exact origin as a prefix, and `//pros/1/a.jpg` is a different path
   * than `/pros/1/a.jpg`, so an unstripped slash would silently disable cleanup.
   */
  function resolveOrigin(bucket: string, configured: string | null): string {
    const trimmed = configured?.trim();
    return trimmed ? trimmed.replace(/\/+$/, '') : regionalOrigin(bucket);
  }

  /** A bucket's own regional S3 URL, always available regardless of any CDN. */
  function regionalOrigin(bucket: string): string {
    return `https://${bucket}.s3.${region}.amazonaws.com`;
  }

  // Resolved once, up front: every URL this service hands out — and the
  // ownership check in removeAvatar below — must agree on the origin.
  const selfieOrigin = resolveOrigin(selfiesBucket, publicBaseUrls.selfies);
  const jobImageOrigin = resolveOrigin(jobImagesBucket, publicBaseUrls.jobImages);
  const avatarOrigin = resolveOrigin(avatarsBucket, publicBaseUrls.avatars);

  /**
   * The origins a stored avatar URL may legitimately carry.
   *
   * The bucket's own S3 URL stays in the set even once a CDN origin is
   * configured. Moving avatars behind CloudFront does not rewrite the URLs
   * already in the database, so without this every avatar uploaded before the
   * move would stop matching and its object would leak on replace — silently,
   * since a non-match is a `return` rather than an error. Still a closed set,
   * so a foreign host is rejected exactly as before.
   */
  const acceptedAvatarOrigins = publicBaseUrls.avatars
    ? [avatarOrigin, regionalOrigin(avatarsBucket)]
    : [avatarOrigin];

  /**
   * The storage key a stored avatar URL points at, or null when it is not one of
   * ours. Rejects an empty key: `https://origin/` names no object, and a
   * `DeleteObject` with an empty key is not a cleanup.
   */
  function avatarKeyFrom(publicUrl: string): string | null {
    for (const origin of acceptedAvatarOrigins) {
      const prefix = `${origin}/`;
      if (!publicUrl.startsWith(prefix)) continue;
      const key = publicUrl.slice(prefix.length);
      if (key) return key;
    }
    return null;
  }

  function selfiePublicUrl(path: string): string {
    return `${selfieOrigin}/${path}`;
  }

  /** The public read URL for a stored job image. */
  function jobImagePublicUrl(path: string): string {
    return `${jobImageOrigin}/${path}`;
  }

  /** The public read URL for a stored avatar. */
  function avatarPublicUrl(path: string): string {
    return `${avatarOrigin}/${path}`;
  }

  /** Mints the short-lived URL a caller PUTs its JPEG to. */
  async function signUpload(bucket: string, key: string): Promise<string> {
    try {
      // The content type is signed, so S3 rejects the upload unless the client
      // sends exactly the header this minted the URL for.
      return await sign(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ContentType: IMAGE_CONTENT_TYPE,
        }),
        { expiresIn: UPLOAD_URL_TTL_SECONDS },
      );
    } catch (cause) {
      logger.error('Could not mint a signed upload URL.', cause);
      throw createHttpError(502, ApiErrorCode.INTERNAL, 'Could not start the upload.', { cause });
    }
  }

  /**
   * Whether an object reached the bucket, and rejects it if it is too big.
   *
   * `HEAD` is the one call that answers both questions: it 404s when nothing
   * landed and reports `content-length` when something did.
   *
   * The size check is this module's job, not the bucket's. Supabase enforced
   * `file_size_limit` as bucket metadata, so an oversize PUT was rejected at
   * the storage layer. S3 has no equivalent — it will happily store a gigabyte
   * — so the limit that used to be metadata is now enforced here, at the moment
   * the domain would otherwise record the object. A limit that only exists in
   * this file is one the server can actually apply.
   *
   * Returns `true` only when the object is present *and* acceptable. Throwing
   * rather than returning `false` on the oversize case is deliberate: a missing
   * object is retryable and an oversize one is not, and the caller must not be
   * told to retry something that will never succeed.
   */
  async function objectExists(
    bucket: string,
    key: string,
    maxBytes: number,
    label: string,
  ): Promise<boolean> {
    let size: number | undefined;
    try {
      const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      size = head.ContentLength;
    } catch {
      // A missing key, a denied read and a transport fault are indistinguishable
      // here, and every one of them means "do not record this object".
      return false;
    }

    if (typeof size !== 'number') {
      // Present but unreportable length: treat as absent rather than trust an
      // unknown payload.
      return false;
    }
    if (size > maxBytes) {
      throw createHttpError(
        422,
        ApiErrorCode.VALIDATION_FAILED,
        `That ${label} is larger than the ${Math.floor(maxBytes / (1024 * 1024))} MiB limit.`,
      );
    }
    return true;
  }

  /**
   * Mints a signed URL the caller PUTs the JPEG to directly.
   *
   * `PutObject` overwrites an existing key, which is what lets a retake reuse
   * the deterministic selfie path instead of failing on it.
   */
  async function createSelfieUpload(userId: string): Promise<{ path: string; uploadUrl: string }> {
    const path = selfiePathFor(userId);
    return { path, uploadUrl: await signUpload(selfiesBucket, path) };
  }

  /**
   * Whether the object actually reached the bucket before anything is recorded,
   * so a profile can never point at a photo that was never uploaded.
   *
   * Throws if it arrived but is oversize.
   */
  async function selfieExists(userId: string): Promise<boolean> {
    return objectExists(selfiesBucket, selfiePathFor(userId), SELFIE_MAX_BYTES, 'photo');
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
    return { path, uploadUrl: await signUpload(jobImagesBucket, path) };
  }

  /**
   * Whether a submitted job-image path points at an object that really reached
   * storage.
   *
   * Used by the jobs domain before it records a path, so a job can never
   * reference a photo that was never uploaded.
   */
  async function jobImageExists(path: string): Promise<boolean> {
    return objectExists(jobImagesBucket, path, JOB_IMAGE_MAX_BYTES, 'photo');
  }

  /**
   * Mints a signed URL the caller PUTs the avatar bytes to directly.
   *
   * The path is unique to this one upload, so every completed replace points at
   * an object that has never been fetched before — a fresh network read rather
   * than a cached one.
   */
  async function createAvatarUpload(
    surface: AvatarSurface,
    userId: string,
  ): Promise<{ path: string; uploadUrl: string }> {
    const path = avatarPathFor(surface, userId);
    return { path, uploadUrl: await signUpload(avatarsBucket, path) };
  }

  /**
   * Whether a submitted avatar path points at an object that really reached
   * storage, checked before the profile ever points at it.
   */
  async function avatarExists(path: string): Promise<boolean> {
    return objectExists(avatarsBucket, path, AVATAR_MAX_BYTES, 'photo');
  }

  /**
   * Deletes a superseded avatar object, extracting its storage key from the
   * public URL the profile previously referenced.
   *
   * Best-effort: the replace is already recorded, so a failed delete is an
   * orphaned object, not an integrity problem — but it is logged loudly, never
   * swallowed (CLAUDE.md "Error Handling"). URLs outside this bucket's accepted
   * origins are ignored so a stale or foreign value cannot make us remove
   * something we do not own.
   */
  async function removeAvatar(previousPublicUrl: string | null | undefined): Promise<void> {
    if (!previousPublicUrl) return;
    const key = avatarKeyFrom(previousPublicUrl);
    if (!key) return;

    try {
      await s3.send(new DeleteObjectCommand({ Bucket: avatarsBucket, Key: key }));
    } catch (error) {
      logger.error('Avatar cleanup failed; an orphaned object remains.', error);
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
