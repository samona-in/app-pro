import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
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
 * How long a minted document read URL stays usable.
 *
 * Documents are never public: identity and bank details sit in this bucket,
 * so every read goes through a short-lived presigned GET minted for the owner
 * or an admin. Long enough to open a file, far too short for a leaked link to
 * outlive its usefulness.
 */
const DOCUMENT_URL_TTL_SECONDS = 600;

/**
 * Mints a presigned URL for one upload.
 *
 * Injected so tests can drive the handshake without a signing backend; the
 * default is the AWS SDK's own signer, which needs no credentials of its own
 * because the client resolves them from the ambient provider chain. The same
 * signer mints read URLs (GetObject) as well as upload URLs.
 */
export type SignUploadUrl = (
  command: PutObjectCommand | GetObjectCommand,
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
  /** Bucket holding marketing banners. */
  bannersBucket?: string | null;
  /**
   * Bucket holding submitted pro documents. Private — no public origin is
   * configured for it and no public URL is ever built from its path; reads go
   * through short-lived presigned GETs.
   */
  documentsBucket: string;
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
    banners?: string | null;
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

/** Largest submitted document the API will accept, in bytes. */
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Bounds for a submitted document image's pixel dimensions.
 *
 * Deliberately lenient. The floor exists to reject a thumbnail or a corrupt
 * header rather than to police image quality — the app's own Aadhaar camera
 * enforces a stricter floor before it uploads, but the generic document picker
 * accepts screenshots and scans whose dimensions we should not second-guess
 * after the fact. The ceiling rejects a decompression-bomb header: no real
 * identity document needs more than 12,000 pixels on a side.
 */
export const DOCUMENT_MIN_DIMENSION_PX = 200;
export const DOCUMENT_MAX_DIMENSION_PX = 12_000;

/**
 * The leading bytes read to parse an image header.
 *
 * A JPEG's SOF segment sits after its metadata, which can include an EXIF
 * thumbnail tens of kilobytes long, so the window is generous. A PNG puts its
 * IHDR in the first 24 bytes.
 */
const IMAGE_HEADER_BYTES = 256 * 1024;

/** An image's pixel dimensions, as read from its own header. */
interface ImageDimensions {
  width: number;
  height: number;
}

/** Reads a big-endian unsigned 32-bit integer at `offset`. */
function uint32(bytes: Uint8Array, offset: number): number {
  const b0 = bytes[offset]!;
  const b1 = bytes[offset + 1]!;
  const b2 = bytes[offset + 2]!;
  const b3 = bytes[offset + 3]!;
  return ((b0 << 24) >>> 0) + (b1 << 16) + (b2 << 8) + b3;
}

/**
 * A JPEG's dimensions from its SOF (start-of-frame) segment.
 *
 * Walks the marker chain rather than assuming a fixed offset, because EXIF,
 * ICC profiles and thumbnails all sit ahead of the frame header. Returns null
 * for anything that is not a parseable JPEG; callers treat that as unreadable
 * rather than guessing at dimensions.
 */
function jpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    let marker = bytes[offset + 1]!;
    // Fill bytes: any number of 0xFF may precede the marker itself.
    while (marker === 0xff && offset + 2 < bytes.length) {
      offset += 1;
      marker = bytes[offset + 1]!;
    }
    offset += 2;

    // Standalone markers carry no length field.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    // Start of scan or end of image means the frame header was never found.
    if (marker === 0xda || marker === 0xd9) return null;
    if (offset + 2 > bytes.length) return null;

    const length = (bytes[offset]! << 8) | bytes[offset + 1]!;
    if (length < 2) return null;

    // SOF0–SOF15 carry the frame size, except DHT (C4), JPG (C8) and DAC (CC),
    // which share the range but are not frame headers.
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (offset + 7 > bytes.length) return null;
      // length(2) precision(1) height(2) width(2)
      const height = (bytes[offset + 3]! << 8) | bytes[offset + 4]!;
      const width = (bytes[offset + 5]! << 8) | bytes[offset + 6]!;
      return width > 0 && height > 0 ? { width, height } : null;
    }

    offset += length;
  }
  return null;
}

/**
 * A PNG's dimensions from its mandatory leading IHDR chunk.
 *
 * The PNG spec fixes IHDR as the first chunk, so this is a constant-offset
 * read once the signature matches.
 */
function pngDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 24) return null;
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[i] !== signature[i]) return null;
  }
  // IHDR: length(4) type(4) width(4) height(4)
  if (bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) {
    return null;
  }
  const width = uint32(bytes, 16);
  const height = uint32(bytes, 20);
  return width > 0 && height > 0 ? { width, height } : null;
}

/** The dimensions of a JPEG or PNG, or null when the header is unreadable. */
function imageDimensions(bytes: Uint8Array): ImageDimensions | null {
  return jpegDimensions(bytes) ?? pngDimensions(bytes);
}

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
 * The folder scope one account's documents live under.
 *
 * Ownership of a submitted path is a prefix comparison against this — the
 * client never chooses where its bytes land and can never reference another
 * pro's documents.
 */
function documentScopeFor(userId: string): string {
  return `pros/${userId}/documents/`;
}

/**
 * File extensions the documents bucket accepts, keyed by content type.
 *
 * The extension is derived from the (schema-validated) content type rather
 * than taken from a client-supplied file name, so a name can never steer the
 * key. An unknown type is refused here as well as in the upload schema: two
 * checks, one outcome.
 */
const DOCUMENT_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

/**
 * A document's storage path.
 *
 * Unique per upload, like avatars: documents are immutable records — an edit
 * is a delete plus a fresh upload — so nothing ever overwrites an object a
 * review may already have seen.
 */
function documentPathFor(userId: string, contentType: string): string {
  const extension = DOCUMENT_EXTENSIONS[contentType];
  if (!extension) {
    throw createHttpError(
      422,
      ApiErrorCode.VALIDATION_FAILED,
      'That file type is not supported. Upload a PDF, JPEG or PNG.',
    );
  }
  return `${documentScopeFor(userId)}${randomUUID()}.${extension}`;
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
  const {
    region,
    selfiesBucket,
    jobImagesBucket,
    avatarsBucket,
    documentsBucket,
    publicBaseUrls,
    s3,
  } = deps;
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
  const bannerOrigin = deps.bannersBucket
    ? resolveOrigin(deps.bannersBucket, publicBaseUrls.banners ?? null)
    : null;

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
  async function signUpload(
    bucket: string,
    key: string,
    contentType = IMAGE_CONTENT_TYPE,
  ): Promise<string> {
    try {
      // The content type is signed, so S3 rejects the upload unless the client
      // sends exactly the header this minted the URL for.
      return await sign(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ContentType: contentType,
        }),
        { expiresIn: UPLOAD_URL_TTL_SECONDS },
      );
    } catch (cause) {
      logger.error('Could not mint a signed upload URL.', cause);
      throw createHttpError(502, ApiErrorCode.INTERNAL, 'Could not start the upload.', { cause });
    }
  }

  /**
   * What landed for one key, and rejects it if it is too big.
   *
   * `HEAD` is the one call that answers both questions: it 404s when nothing
   * landed and reports `content-length` (plus the stored content type) when
   * something did.
   *
   * The size check is this module's job, not the bucket's. Supabase enforced
   * `file_size_limit` as bucket metadata, so an oversize PUT was rejected at
   * the storage layer. S3 has no equivalent — it will happily store a gigabyte
   * — so the limit that used to be metadata is now enforced here, at the moment
   * the domain would otherwise record the object. A limit that only exists in
   * this file is one the server can actually apply.
   *
   * Returns null only when the object is absent *or* unreportable — both mean
   * "do not record this object". Throwing rather than returning null on the
   * oversize case is deliberate: a missing object is retryable and an oversize
   * one is not, and the caller must not be told to retry something that will
   * never succeed.
   */
  async function objectInfo(
    bucket: string,
    key: string,
    maxBytes: number,
    label: string,
  ): Promise<{ sizeBytes: number; contentType: string | null } | null> {
    let size: number | undefined;
    let contentType: string | undefined;
    try {
      const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      size = head.ContentLength;
      contentType = head.ContentType;
    } catch {
      // A missing key, a denied read and a transport fault are indistinguishable
      // here, and every one of them means "do not record this object".
      return null;
    }

    if (typeof size !== 'number') {
      // Present but unreportable length: treat as absent rather than trust an
      // unknown payload.
      return null;
    }
    if (size > maxBytes) {
      throw createHttpError(
        422,
        ApiErrorCode.VALIDATION_FAILED,
        `That ${label} is larger than the ${Math.floor(maxBytes / (1024 * 1024))} MiB limit.`,
      );
    }
    return { sizeBytes: size, contentType: contentType ?? null };
  }

  /**
   * Whether an object reached the bucket, and rejects it if it is too big.
   *
   * Returns `true` only when the object is present *and* acceptable.
   */
  async function objectExists(
    bucket: string,
    key: string,
    maxBytes: number,
    label: string,
  ): Promise<boolean> {
    return (await objectInfo(bucket, key, maxBytes, label)) !== null;
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

  /**
   * Begins the one document upload handshake: a unique path under the caller's
   * own folder plus a URL signed for exactly the declared content type, so S3
   * rejects an upload whose header disagrees with what was asked for.
   *
   * The caller must have validated `contentType` against the shared allowlist;
   * `documentPathFor` refuses anything it has no extension for regardless.
   */
  async function createDocumentUpload(
    userId: string,
    contentType: string,
  ): Promise<{ path: string; uploadUrl: string }> {
    const path = documentPathFor(userId, contentType);
    return { path, uploadUrl: await signUpload(documentsBucket, path, contentType) };
  }

  /**
   * Reads the leading bytes of a stored document and parses its dimensions.
   *
   * A ranged GET keeps this cheap: the header is in the first few kilobytes
   * even for a large photo. Returns null when the object cannot be read or the
   * header is not a parseable JPEG/PNG, which the caller treats as a refused
   * upload rather than recording a document it could not inspect.
   */
  async function documentImageDimensions(path: string): Promise<ImageDimensions | null> {
    try {
      const object = await s3.send(
        new GetObjectCommand({
          Bucket: documentsBucket,
          Key: path,
          Range: `bytes=0-${IMAGE_HEADER_BYTES - 1}`,
        }),
      );
      const bytes = await object.Body?.transformToByteArray();
      return bytes ? imageDimensions(bytes) : null;
    } catch (cause) {
      logger.error('Could not read a document image header.', cause);
      return null;
    }
  }

  /**
   * What actually landed for a submitted document path: size and content type
   * read from the object itself, never from what the client claimed.
   *
   * Null when nothing landed (the route turns that into a retryable 409);
   * throws 422 when the object arrived but is unacceptable. Images are probed
   * for their real dimensions, so a document cannot be recorded on the
   * client's word that it is a legible scan. A refused image is deleted here,
   * exactly like a refused content type, so it cannot accumulate unseen.
   */
  async function documentObjectInfo(
    path: string,
  ): Promise<{ sizeBytes: number; contentType: string | null } | null> {
    const info = await objectInfo(documentsBucket, path, DOCUMENT_MAX_BYTES, 'document');
    if (!info) return null;

    // Only image documents carry pixel dimensions; PDFs are validated by type
    // and size alone and never incur a second storage read.
    const isImage = info.contentType === 'image/jpeg' || info.contentType === 'image/png';
    if (!isImage) return info;

    const dimensions = await documentImageDimensions(path);
    if (!dimensions) {
      await removeDocument(path);
      throw createHttpError(
        422,
        ApiErrorCode.VALIDATION_FAILED,
        'That image could not be read. Try a different photo.',
      );
    }

    const shortEdge = Math.min(dimensions.width, dimensions.height);
    const longEdge = Math.max(dimensions.width, dimensions.height);
    if (shortEdge < DOCUMENT_MIN_DIMENSION_PX || longEdge > DOCUMENT_MAX_DIMENSION_PX) {
      await removeDocument(path);
      throw createHttpError(
        422,
        ApiErrorCode.VALIDATION_FAILED,
        'That image is too small or too large to review. Try a different photo.',
      );
    }

    return info;
  }

  /**
   * Mints the short-lived read URL for one stored document.
   *
   * The bucket is private and no public URL variant exists for it: identity
   * and bank details are in there, so every read is a fresh, expiring,
   * authenticated signature rather than a stable link.
   */
  async function documentContentUrl(path: string): Promise<string> {
    try {
      return await sign(new GetObjectCommand({ Bucket: documentsBucket, Key: path }), {
        expiresIn: DOCUMENT_URL_TTL_SECONDS,
      });
    } catch (cause) {
      logger.error('Could not mint a signed document read URL.', cause);
      throw createHttpError(502, ApiErrorCode.INTERNAL, 'Could not open the document.', { cause });
    }
  }

  /**
   * Deletes a submitted document's object once its row is gone.
   *
   * Best-effort: the row is already deleted, so a failed delete is an orphaned
   * object, not an integrity problem — but it is logged loudly, never swallowed
   * (CLAUDE.md "Error Handling").
   */
  async function removeDocument(path: string): Promise<void> {
    if (!path) return;
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: documentsBucket, Key: path }));
    } catch (error) {
      logger.error('Document cleanup failed; an orphaned object remains.', error);
    }
  }

  /**
   * Lists one page of object metadata under a key prefix.
   *
   * Unlike `removeObjectPrefix`, this is a read used by retention cleanup to
   * decide what may be removed: the safety window needs `lastModified`, and
   * orphan detection needs the key set. One page at a time keeps a large bucket
   * from being pulled into memory in a single call; the caller follows
   * `nextToken` until it is null.
   */
  async function listObjects(
    bucket: string,
    prefix: string,
    options: { continuationToken?: string; maxKeys?: number } = {},
  ): Promise<{
    objects: Array<{ key: string; lastModified: Date | null; size: number | null }>;
    nextToken: string | null;
  }> {
    const listed = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: options.continuationToken,
        MaxKeys: options.maxKeys,
      }),
    );
    const objects = (listed.Contents ?? [])
      .map((object) => ({
        key: object.Key,
        lastModified: object.LastModified ?? null,
        size: typeof object.Size === 'number' ? object.Size : null,
      }))
      .filter(
        (object): object is { key: string; lastModified: Date | null; size: number | null } =>
          typeof object.key === 'string' && object.key.length > 0,
      );
    return { objects, nextToken: listed.NextContinuationToken ?? null };
  }

  /**
   * Deletes a set of named objects, throwing if any single key fails.
   *
   * Retention cleanup uses this rather than the best-effort `removeDocument`:
   * a partial failure must abort the category so the durable database reference
   * is not dropped before its storage deletion is confirmed. Empty keys are
   * ignored — `DeleteObject` with an empty key is not a cleanup.
   */
  async function deleteObjects(bucket: string, keys: readonly string[]): Promise<void> {
    const filtered = keys.filter((key) => key.length > 0);
    if (filtered.length === 0) return;
    const deleted = await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: filtered.map((Key) => ({ Key })) },
      }),
    );
    if (deleted.Errors && deleted.Errors.length > 0) {
      const detail = deleted.Errors.map(
        (e) => `${e.Key ?? '?'}: ${e.Code ?? e.Message ?? 'error'}`,
      ).join(', ');
      throw new Error(`S3 delete partially failed: ${detail}`);
    }
  }

  /** Deletes one object, throwing on failure. Same contract as `deleteObjects`. */
  async function deleteObject(bucket: string, key: string): Promise<void> {
    if (!key) return;
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  /**
   * Deletes every object under a key prefix (e.g. all of one pro's files).
   *
   * Used by account deletion to purge the pro's own objects across buckets.
   * Unlike `removeAvatar`/`removeDocument`, a failure here *throws*: leaving a
   * selfie or a bank document behind a deleted identity is a privacy leak, not
   * an orphaned object, so the deletion workflow treats S3 as a retryable step
   * rather than best-effort. Handles ListObjectsV2 pagination and partial
   * DeleteObjects failures.
   */
  async function removeObjectPrefix(bucket: string, prefix: string): Promise<void> {
    if (!prefix) return;
    let continuationToken: string | undefined;
    do {
      const listed = await s3.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      const keys = (listed.Contents ?? [])
        .map((object) => object.Key)
        .filter((key): key is string => typeof key === 'string' && key.length > 0);
      if (keys.length > 0) {
        const deleted = await s3.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: keys.map((Key) => ({ Key })) },
          }),
        );
        if (deleted.Errors && deleted.Errors.length > 0) {
          const detail = deleted.Errors.map(
            (e) => `${e.Key ?? '?'}: ${e.Code ?? e.Message ?? 'error'}`,
          ).join(', ');
          throw new Error(`S3 delete under "${prefix}" partially failed: ${detail}`);
        }
      }
      continuationToken = listed.NextContinuationToken;
    } while (continuationToken);
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
    createDocumentUpload,
    documentObjectInfo,
    documentContentUrl,
    documentScope: documentScopeFor,
    removeDocument,
    selfiesBucket,
    jobImagesBucket,
    avatarsBucket,
    bannersBucket: deps.bannersBucket ?? null,
    documentsBucket,
    removeObjectPrefix,
    listObjects,
    deleteObjects,
    deleteObject,
    keyFromAvatarUrl: avatarKeyFrom,
  };
}

export type StorageService = ReturnType<typeof createStorageService>;
