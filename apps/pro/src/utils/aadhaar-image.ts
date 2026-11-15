import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { TranslationKey } from '@/i18n';
import { AADHAAR_CARD_ASPECT_RATIO } from './aadhaar-card';

/**
 * Local image preparation for the Aadhaar capture flow.
 *
 * The camera hands us a full-size JPEG. Before anything leaves the device we
 * crop it to the card-shaped frame the preview showed, resize the long edge
 * down, and re-encode it as a fresh JPEG. Re-encoding is also what discards
 * EXIF metadata, including any GPS tags the camera wrote. Cropping keeps the
 * upload to exactly what the Pro lined up — no table, background or second
 * document creeping in around the card.
 *
 * Everything here is deliberately local-only: no network calls and no logging
 * of file names or URIs. The returned object is kept in memory until the
 * upload finishes (the original is retained alongside the processed copy so a
 * failure can be retried without asking the Pro to take the photo again).
 */

/** Longest edge kept after resizing. Enough to read an Aadhaar, not a poster. */
export const AADHAAR_LONG_EDGE = 2000;

/**
 * Smallest short edge we accept. The server applies its own, slightly more
 * lenient floor; this exists so an unusably small photo never starts uploading.
 */
export const AADHAAR_MIN_SHORT_EDGE = 480;

/** Client-side ceiling, below the server's 10 MiB document limit. */
export const AADHAAR_MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const JPEG_QUALITY = 0.9;
const FALLBACK_JPEG_QUALITY = 0.7;

export type AadhaarImageErrorCode = 'dimensions' | 'unreadable' | 'too-large' | 'processing';

export interface AadhaarImageError extends Error {
  readonly name: 'AadhaarImageError';
  readonly code: AadhaarImageErrorCode;
}

/** Builds a local processing failure the UI can translate into an actionable message. */
export function createAadhaarImageError(code: AadhaarImageErrorCode): AadhaarImageError {
  const error = new Error(code) as Error & {
    -readonly [K in keyof AadhaarImageError]: AadhaarImageError[K];
  };
  error.name = 'AadhaarImageError';
  error.code = code;
  return error;
}

/** Identifies a processing failure without relying on `instanceof` a class. */
export function isAadhaarImageError(error: unknown): error is AadhaarImageError {
  return error instanceof Error && error.name === 'AadhaarImageError' && 'code' in error;
}

/**
 * The translation key for a local processing failure, so the screen can show
 * one actionable sentence instead of a raw exception.
 */
export function aadhaarImageErrorKey(error: unknown): TranslationKey {
  if (isAadhaarImageError(error)) {
    return `aadhaar.errors.${error.code}` as TranslationKey;
  }
  return 'aadhaar.errors.processing';
}

/** What `CameraView.takePictureAsync` gives us. */
export interface CapturedAadhaarPhoto {
  uri: string;
  width: number;
  height: number;
}

/**
 * One captured side, ready to preview and upload.
 *
 * `originalUri` is the camera's own file; `uri` is the processed JPEG that is
 * actually uploaded. Both stay alive until the flow succeeds or is discarded.
 * No Aadhaar number or other content from the image is ever read or stored.
 */
export interface AadhaarImage {
  uri: string;
  originalUri: string;
  width: number;
  height: number;
  sizeBytes: number;
}

function resizeLongEdge(
  context: ReturnType<typeof ImageManipulator.manipulate>,
  width: number,
  height: number,
) {
  if (Math.max(width, height) <= AADHAAR_LONG_EDGE) return context;
  return width >= height
    ? context.resize({ width: AADHAAR_LONG_EDGE })
    : context.resize({ height: AADHAAR_LONG_EDGE });
}

/**
 * The centre rectangle of the sensor image that matches the card frame.
 *
 * `CameraView` fills its card-shaped box by scaling the feed until it covers
 * the box and clipping the overflow, so the visible region is a centre crop.
 * Applying the same crop to the captured file keeps preview and upload in
 * agreement — the Pro only sends what they saw.
 */
function cardFrameCrop(width: number, height: number) {
  if (width / height > AADHAAR_CARD_ASPECT_RATIO) {
    // Wider than the card: trim the sides, keep the full height.
    const cropWidth = Math.round(height * AADHAAR_CARD_ASPECT_RATIO);
    return {
      originX: Math.round((width - cropWidth) / 2),
      originY: 0,
      width: cropWidth,
      height,
    };
  }

  // Taller than the card: trim the top and bottom, keep the full width.
  const cropHeight = Math.round(width / AADHAAR_CARD_ASPECT_RATIO);
  return {
    originX: 0,
    originY: Math.round((height - cropHeight) / 2),
    width,
    height: cropHeight,
  };
}

async function renderJpeg(sourceUri: string, width: number, height: number, compress: number) {
  const crop = cardFrameCrop(width, height);
  const context = resizeLongEdge(
    ImageManipulator.manipulate(sourceUri).crop(crop),
    crop.width,
    crop.height,
  );
  const rendered = await context.renderAsync();
  return rendered.saveAsync({ compress, format: SaveFormat.JPEG });
}

/** Size of a processed file, or 0 when it cannot be read. */
function processedFileSize(uri: string): number {
  try {
    const file = new File(uri);
    return file.exists ? file.size : 0;
  } catch {
    return 0;
  }
}

/**
 * Normalises one camera capture into a bounded JPEG.
 *
 * Throws `AadhaarImageError` for anything the Pro can fix by retaking the
 * photo. The original capture is left on disk; callers decide when to remove
 * it (see `cleanupAadhaarImage`).
 */
export async function processAadhaarCapture(capture: CapturedAadhaarPhoto): Promise<AadhaarImage> {
  const { uri, width, height } = capture;

  if (!uri || !width || !height) {
    throw createAadhaarImageError('unreadable');
  }

  if (Math.min(width, height) < AADHAAR_MIN_SHORT_EDGE) {
    throw createAadhaarImageError('dimensions');
  }

  try {
    let saved = await renderJpeg(uri, width, height, JPEG_QUALITY);
    let sizeBytes = processedFileSize(saved.uri);

    // A very detailed photo can still exceed the cap at 90%. One lower-quality
    // pass is cheap and usually enough; if not, the Pro retakes the photo.
    if (sizeBytes > AADHAAR_MAX_UPLOAD_BYTES) {
      saved = await renderJpeg(uri, width, height, FALLBACK_JPEG_QUALITY);
      sizeBytes = processedFileSize(saved.uri);
    }

    if (!saved.uri || !saved.width || !saved.height) {
      throw createAadhaarImageError('unreadable');
    }
    if (Math.min(saved.width, saved.height) < AADHAAR_MIN_SHORT_EDGE) {
      throw createAadhaarImageError('dimensions');
    }
    if (sizeBytes <= 0) {
      throw createAadhaarImageError('unreadable');
    }
    if (sizeBytes > AADHAAR_MAX_UPLOAD_BYTES) {
      throw createAadhaarImageError('too-large');
    }

    return {
      uri: saved.uri,
      originalUri: uri,
      width: saved.width,
      height: saved.height,
      sizeBytes,
    };
  } catch (cause) {
    if (isAadhaarImageError(cause)) throw cause;
    throw createAadhaarImageError('processing');
  }
}

/**
 * Best-effort removal of both local files for one captured side.
 *
 * Called when a side is retaken and when the flow succeeds or is abandoned.
 * A failed delete is harmless (the OS cache reclaims it), so it is never
 * allowed to interrupt navigation or surface as an error.
 */
export function cleanupAadhaarImage(
  image: Pick<AadhaarImage, 'uri' | 'originalUri'> | null | undefined,
): void {
  if (!image) return;

  for (const uri of new Set([image.uri, image.originalUri])) {
    if (!uri || !uri.startsWith('file://')) continue;
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      // Local cache cleanup is best-effort; never block the flow on it.
    }
  }
}
