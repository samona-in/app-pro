#!/usr/bin/env node
/**
 * Migrate the Supabase Storage `services` bucket to AWS S3 as optimized WebP.
 *
 * Safety contract:
 * - Dry-run by default. Nothing is uploaded without `--execute`.
 * - Source objects are only ever read. Nothing is deleted or modified there.
 * - A destination object is never overwritten blindly. It is HEADed first; an
 *   object this script did not create is reported as a conflict unless
 *   `--overwrite-existing` is passed explicitly.
 * - Every successful upload is HEADed again and checked for size + content type.
 * - State is persisted after every image, so an interrupted run resumes.
 *
 * Usage:
 *   node scripts/service-images-migration/migrate-service-images.mjs
 *   node scripts/service-images-migration/migrate-service-images.mjs --dry-run --sample 10
 *   node scripts/service-images-migration/migrate-service-images.mjs --execute --concurrency 4
 *   node scripts/service-images-migration/migrate-service-images.mjs --execute --resume
 *
 * Run `--help` for every flag.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { loadEnv } from './env.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENV = loadEnv();

const TARGET_BYTES_DEFAULT = 50 * 1024;
const WEBP_CONTENT_TYPE = 'image/webp';
const IMAGE_EXTENSION = /\.(png|jpe?g|webp)$/i;
const MAX_EDGE = 1280;
const MIN_EDGE = 640;
const EDGES = [MAX_EDGE, 1024, 896, 800, MIN_EDGE];
const QUALITIES_LARGE = [80, 72, 65];
const QUALITIES_SMALL = [80, 72, 65, 58, 50];
const RETRY_ATTEMPTS = 3;

const SOURCE_BUCKET_DEFAULT = 'services';
const DEST_BUCKET_DEFAULT = 'samona-staging-services-072842665972';
const DEST_REGION_DEFAULT = 'us-east-1';
const DEST_PREFIX_DEFAULT = 'services/';

function usage() {
  console.log(`Migrate Supabase \`services\` images to AWS S3 as optimized WebP.

Options:
  --execute                 Upload. Without this flag the run is a dry run.
  --dry-run                 Explicit dry run (default).
  --limit <n>               Process at most n images.
  --concurrency <n>         Parallel workers (default 4, max 16).
  --sample <n>              Dry run only: download + optimize n images to preview sizes.
  --source-bucket <name>    Supabase bucket (default ${SOURCE_BUCKET_DEFAULT}).
  --source-prefix <prefix>  Only list keys under this prefix.
  --dest-prefix <prefix>    Destination key prefix (default ${DEST_PREFIX_DEFAULT}).
  --bucket <name>           AWS destination bucket (default ${DEST_BUCKET_DEFAULT}).
  --region <region>         AWS destination region (default ${DEST_REGION_DEFAULT}).
  --target-bytes <n>        Size target in bytes (default ${TARGET_BYTES_DEFAULT}).
  --overwrite-existing      Allow replacing an existing object this script did not create.
  --fresh                   Ignore and replace the previous state file.
  --no-resume               Do not skip images already recorded as successful.
  --state-dir <path>        State + logs directory.
  --reports-dir <path>      Report output directory.
  --help                    Show this help.

Resume:
  State is kept in .state/state.json and saved after every image. Re-running
  --execute without --fresh continues where the last run stopped.
`);
}

function parsePositiveInt(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer.`);
  }
  return parsed;
}

function parseArgs(argv) {
  const opts = {
    execute: false,
    limit: Number.POSITIVE_INFINITY,
    concurrency: 4,
    sample: 0,
    sourceBucket: SOURCE_BUCKET_DEFAULT,
    sourcePrefix: '',
    destPrefix: DEST_PREFIX_DEFAULT,
    bucket: ENV.S3_BUCKET_SERVICES || DEST_BUCKET_DEFAULT,
    region: ENV.AWS_REGION || DEST_REGION_DEFAULT,
    targetBytes: TARGET_BYTES_DEFAULT,
    overwriteExisting: false,
    fresh: false,
    resume: true,
    stateDir: path.join(HERE, '.state'),
    reportsDir: path.join(HERE, 'reports'),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      i += 1;
      if (i >= argv.length) throw new Error(`${arg} requires a value.`);
      return argv[i];
    };

    switch (arg) {
      case '--execute':
        opts.execute = true;
        break;
      case '--dry-run':
        opts.execute = false;
        break;
      case '--limit':
        opts.limit = parsePositiveInt(value(), arg);
        break;
      case '--concurrency':
        opts.concurrency = Math.min(16, parsePositiveInt(value(), arg));
        break;
      case '--sample':
        opts.sample = parsePositiveInt(value(), arg);
        break;
      case '--source-bucket':
        opts.sourceBucket = value();
        break;
      case '--source-prefix':
        opts.sourcePrefix = value().replace(/^\/+/, '');
        break;
      case '--dest-prefix':
        opts.destPrefix = value().replace(/^\/+/, '').replace(/\/?$/, '/');
        break;
      case '--bucket':
        opts.bucket = value();
        break;
      case '--region':
        opts.region = value();
        break;
      case '--target-bytes':
        opts.targetBytes = parsePositiveInt(value(), arg);
        break;
      case '--overwrite-existing':
        opts.overwriteExisting = true;
        break;
      case '--fresh':
        opts.fresh = true;
        break;
      case '--no-resume':
        opts.resume = false;
        break;
      case '--state-dir':
        opts.stateDir = path.resolve(value());
        break;
      case '--reports-dir':
        opts.reportsDir = path.resolve(value());
        break;
      case '--help':
      case '-h':
        usage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (opts.destPrefix === '/') opts.destPrefix = '';
  return opts;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(error) {
  const status = error?.$metadata?.httpStatusCode;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return status === 408 || status === 429;
  }
  return true;
}

async function withRetry(label, fn, attempts = RETRY_ATTEMPTS) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isRetryable(error)) break;
      const delay = 600 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
      console.warn(`  retry ${attempt}/${attempts - 1} ${label} in ${delay}ms: ${error.message}`);
      await sleep(delay);
    }
  }
  throw lastError;
}

function bytes(n) {
  if (!Number.isFinite(n)) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function pct(part, total) {
  if (!total) return '0.0%';
  return `${((part / total) * 100).toFixed(1)}%`;
}

/** Public URL for a destination key, preserving slashes and encoding the rest. */
function publicUrl(bucket, region, key) {
  const encodedKey = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
}

function destinationKey(sourceKey, destPrefix) {
  return `${destPrefix}${sourceKey.replace(IMAGE_EXTENSION, '.webp')}`;
}

function createSourceClient() {
  const endpoint = ENV.S3_ENDPOINT?.trim();
  const accessKeyId = ENV.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = ENV.S3_SECRET_ACCESS_KEY?.trim();
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'Source S3 gateway is not configured. Set S3_ENDPOINT, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.',
    );
  }
  return new S3Client({
    region: ENV.S3_REGION || 'ap-southeast-1',
    endpoint,
    forcePathStyle: ENV.S3_FORCE_PATH_STYLE !== 'false',
    credentials: { accessKeyId, secretAccessKey },
  });
}

function createDestinationClient(region) {
  // No credentials are passed. The SDK resolves them from the ambient provider
  // chain (AWS profile, SSO, or an assumed role), never from this file.
  return new S3Client({ region });
}

async function listSourceObjects(client, bucket, prefix) {
  const objects = [];
  let continuationToken;
  do {
    const page = await withRetry(`list ${bucket}`, () =>
      client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix || undefined,
          ContinuationToken: continuationToken,
        }),
      ),
    );
    for (const object of page.Contents ?? []) {
      if (!object.Key || object.Key.endsWith('/')) continue;
      objects.push({
        key: object.Key,
        size: object.Size ?? 0,
        etag: (object.ETag ?? '').replace(/"/g, ''),
        lastModified: object.LastModified ?? null,
      });
    }
    continuationToken = page.NextContinuationToken;
  } while (continuationToken);

  return objects.sort((a, b) => a.key.localeCompare(b.key));
}

async function downloadSource(client, bucket, key) {
  return withRetry(`download ${key}`, async () => {
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!response.Body) throw new Error('S3 returned an empty body.');
    const bytes = await response.Body.transformToByteArray();
    return Buffer.from(bytes);
  });
}

/**
 * Encodes one image at the highest quality that fits the target.
 *
 * The ladder walks the largest acceptable size first and only shrinks after
 * quality alone cannot meet the target. Small originals are never enlarged and
 * never resized below their own dimensions. If even MIN_EDGE at the lowest
 * quality is too large, the smallest encode is returned flagged as above
 * target rather than destroying the image further.
 */
async function optimizeToWebp(input, targetBytes) {
  const metadata = await sharp(input).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('Image has no readable dimensions.');
  }

  const orientation = metadata.orientation ?? 1;
  const swapped = orientation >= 5 && orientation <= 8;
  const originalWidth = swapped ? metadata.height : metadata.width;
  const originalHeight = swapped ? metadata.width : metadata.height;

  const caps =
    originalWidth > MAX_EDGE ? EDGES : [null, ...EDGES.filter((edge) => edge < originalWidth)];

  let best = null;

  for (const cap of caps) {
    const qualities = cap !== null && cap >= MAX_EDGE ? QUALITIES_LARGE : QUALITIES_SMALL;

    for (const quality of qualities) {
      let pipeline = sharp(input).rotate();
      if (cap !== null) {
        pipeline = pipeline.resize({
          width: cap,
          height: cap,
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      const buffer = await pipeline.webp({ quality, effort: 4 }).toBuffer();

      const scale = cap === null ? 1 : Math.min(1, cap / Math.max(originalWidth, originalHeight));
      const width = Math.max(1, Math.round(originalWidth * scale));
      const height = Math.max(1, Math.round(originalHeight * scale));

      const candidate = { buffer, quality, width, height, cap };
      if (!best || buffer.length < best.buffer.length) best = candidate;
      if (buffer.length <= targetBytes) return { ...candidate, aboveTarget: false };
    }
  }

  if (!best) throw new Error('Could not encode the image.');
  return { ...best, aboveTarget: true };
}

async function headOrNull(client, bucket, key) {
  try {
    return await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode;
    if (status === 404 || error?.name === 'NotFound' || error?.name === 'NoSuchKey') return null;
    throw error;
  }
}

function migratedByUs(head, sourceKey) {
  const marker = head?.Metadata?.['migrated-from'];
  return marker === encodeURIComponent(sourceKey) && head?.ContentType === WEBP_CONTENT_TYPE;
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeAtomicJson(file, value) {
  const temporary = `${file}.tmp`;
  writeJson(temporary, value);
  renameSync(temporary, file);
}

function createStateStore(stateDir, fresh) {
  ensureDir(stateDir);
  const stateFile = path.join(stateDir, 'state.json');
  if (fresh && existsSync(stateFile)) {
    const archive = path.join(
      stateDir,
      `state-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    );
    renameSync(stateFile, archive);
  }
  return stateFile;
}

function loadState(stateFile, opts) {
  if (!existsSync(stateFile)) {
    return {
      version: 1,
      sourceBucket: opts.sourceBucket,
      destinationBucket: opts.bucket,
      destinationRegion: opts.region,
      destinationPrefix: opts.destPrefix,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      items: {},
    };
  }

  const state = JSON.parse(readFileSync(stateFile, 'utf8'));
  const mismatch =
    state.sourceBucket !== opts.sourceBucket ||
    state.destinationBucket !== opts.bucket ||
    state.destinationRegion !== opts.region ||
    state.destinationPrefix !== opts.destPrefix;
  if (mismatch) {
    throw new Error(
      'The state file belongs to a different source/destination configuration. ' +
        'Re-run with --fresh after confirming the target, or point --state-dir elsewhere.',
    );
  }
  return state;
}

function createLogger(stateDir) {
  ensureDir(stateDir);
  const logFile = path.join(stateDir, 'migration.log');
  return (message) => {
    const line = `[${new Date().toISOString()}] ${message}`;
    console.log(line);
    appendFileSync(logFile, `${line}\n`, 'utf8');
  };
}

async function runPool(items, concurrency, worker) {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  });
  await Promise.all(workers);
}

function summarize(state, objects) {
  const rows = Object.values(state.items);
  const uploaded = rows.filter((row) => row.status === 'uploaded');
  const aboveTarget = uploaded.filter((row) => row.aboveTarget);
  const already = rows.filter((row) => row.status === 'already-exists');
  const failed = rows.filter((row) => row.status === 'failed');
  const conflicts = rows.filter((row) => row.status === 'conflict');

  const originalBytes = objects.reduce((sum, object) => sum + object.size, 0);
  const optimizedBytes = [...uploaded, ...already].reduce(
    (sum, row) => sum + (row.outputBytes ?? 0),
    0,
  );

  return {
    total: objects.length,
    uploaded: uploaded.length,
    aboveTarget: aboveTarget.length,
    alreadyExists: already.length,
    failed: failed.length,
    conflicts: conflicts.length,
    originalBytes,
    optimizedBytes,
    savedBytes: originalBytes - optimizedBytes,
  };
}

function writeDryRunReport(opts, objects, skipped, collisions, samples, summary) {
  ensureDir(opts.reportsDir);
  const generatedAt = new Date().toISOString();
  const report = {
    generatedAt,
    mode: 'dry-run',
    source: {
      bucket: opts.sourceBucket,
      prefix: opts.sourcePrefix || null,
      objectCount: objects.length,
      totalBytes: objects.reduce((sum, object) => sum + object.size, 0),
    },
    destination: {
      bucket: opts.bucket,
      region: opts.region,
      prefix: opts.destPrefix,
      baseUrl: `https://${opts.bucket}.s3.${opts.region}.amazonaws.com/${opts.destPrefix}`,
    },
    targetBytes: opts.targetBytes,
    conflicts: collisions,
    skippedNonImages: skipped,
    samples,
    summary,
  };
  writeJson(path.join(opts.reportsDir, 'dry-run-report.json'), report);

  const lines = [
    '# Service image migration — dry run',
    '',
    `Generated: ${generatedAt}`,
    '',
    '| Metric | Value |',
    '|---|---|',
    `| Total images | ${objects.length} |`,
    `| Original size | ${bytes(report.source.totalBytes)} |`,
    `| Destination | \`s3://${opts.bucket}/${opts.destPrefix}\` |`,
    `| Region | ${opts.region} |`,
    `| Target per image | ${bytes(opts.targetBytes)} |`,
    `| Filename collisions | ${collisions.length} |`,
    `| Non-image objects skipped | ${skipped.length} |`,
    '',
    '## Sample optimization',
    '',
  ];

  if (samples.length === 0) {
    lines.push('No sample was requested. Run with `--sample 10` to preview real output sizes.', '');
  } else {
    lines.push(
      '| Source | Original | Optimized | Quality | Dimensions | Under target |',
      '|---|---|---|---|---|---|',
      ...samples.map(
        (sample) =>
          `| \`${sample.sourceKey}\` | ${bytes(sample.originalBytes)} | ${bytes(sample.optimizedBytes)} | ${sample.quality} | ${sample.width}×${sample.height} | ${sample.underTarget ? 'yes' : 'NO'} |`,
      ),
      '',
    );
  }

  if (collisions.length > 0) {
    lines.push(
      '## Collisions',
      '',
      'These keys would overwrite each other and must be resolved first:',
      '',
    );
    for (const collision of collisions) {
      lines.push(`- \`${collision.destinationKey}\` ← ${collision.sources.join(', ')}`);
    }
    lines.push('');
  }

  lines.push(
    '## Next step',
    '',
    'Confirm the destination and the sample sizes, then run:',
    '',
    '```bash',
    'node scripts/service-images-migration/migrate-service-images.mjs --execute --concurrency 4',
    '```',
    '',
  );

  writeFileSync(path.join(opts.reportsDir, 'dry-run-report.md'), `${lines.join('\n')}\n`, 'utf8');
}

function writeFinalReports(opts, objects, state, summary, startedAt) {
  ensureDir(opts.reportsDir);
  const generatedAt = new Date().toISOString();
  const rows = objects.map((object) => {
    const item = state.items[object.key] ?? {};
    return {
      sourceKey: object.key,
      destinationKey: item.destinationKey ?? destinationKey(object.key, opts.destPrefix),
      sourceBytes: object.size,
      outputBytes: item.outputBytes ?? null,
      status: item.status ?? 'not-processed',
      quality: item.quality ?? null,
      width: item.width ?? null,
      height: item.height ?? null,
      aboveTarget: Boolean(item.aboveTarget),
      attempts: item.attempts ?? 0,
      error: item.error ?? null,
    };
  });

  const failed = rows.filter((row) => row.status === 'failed' || row.status === 'conflict');
  const above = rows.filter((row) => row.status === 'uploaded' && row.aboveTarget);

  const report = {
    generatedAt,
    startedAt,
    durationMs: Date.now() - new Date(startedAt).getTime(),
    mode: 'execute',
    destination: {
      bucket: opts.bucket,
      region: opts.region,
      prefix: opts.destPrefix,
      baseUrl: `https://${opts.bucket}.s3.${opts.region}.amazonaws.com/${opts.destPrefix}`,
    },
    targetBytes: opts.targetBytes,
    summary,
    aboveTarget: above,
    failed,
    images: rows,
  };

  writeJson(path.join(opts.reportsDir, 'migration-report.json'), report);
  writeJson(path.join(opts.reportsDir, 'failed.json'), failed);
  writeJson(path.join(opts.reportsDir, 'url-map.json'), {
    generatedAt,
    baseUrl: report.destination.baseUrl,
    images: rows.map((row) => ({
      sourceKey: row.sourceKey,
      destinationKey: row.destinationKey,
      publicUrl: publicUrl(opts.bucket, opts.region, row.destinationKey),
    })),
  });

  const largest = [...rows]
    .filter((row) => typeof row.outputBytes === 'number')
    .sort((a, b) => b.outputBytes - a.outputBytes)
    .slice(0, 10);

  const lines = [
    '# Service image migration report',
    '',
    `Generated: ${generatedAt}`,
    '',
    '| Metric | Description | Value |',
    '|---|---|---|',
    `| Total images | Images discovered in Supabase | ${summary.total} |`,
    `| Successful | Images uploaded successfully | ${summary.uploaded} |`,
    `| Failed | Images that failed | ${summary.failed} |`,
    `| Original size | Total original image size | ${bytes(summary.originalBytes)} |`,
    `| Optimized size | Total WebP image size | ${bytes(summary.optimizedBytes)} |`,
    `| Space saved | Total storage reduction | ${bytes(summary.savedBytes)} (${pct(summary.savedBytes, summary.originalBytes)}) |`,
    `| Above 50 KB | Images exceeding target | ${summary.aboveTarget} |`,
    '',
    '## Additional status',
    '',
    '| Status | Count |',
    '|---|---|',
    `| Already present (verified, skipped) | ${summary.alreadyExists} |`,
    `| Conflicts (existing object not created by this migration) | ${summary.conflicts} |`,
    `| Above target but uploaded at best quality | ${summary.aboveTarget} |`,
    '',
    '## Largest optimized images',
    '',
    '| Source | Output | Quality | Dimensions | Above target |',
    '|---|---|---|---|---|',
    ...largest.map(
      (row) =>
        `| \`${row.sourceKey}\` | ${bytes(row.outputBytes)} | ${row.quality} | ${row.width}×${row.height} | ${row.aboveTarget ? 'YES' : 'no'} |`,
    ),
    '',
  ];

  if (above.length > 0) {
    lines.push(
      '## Images above 50 KB',
      '',
      'These were uploaded at the lowest acceptable setting rather than shrinking further.',
      '',
      '| Source | Output | Dimensions |',
      '|---|---|---|',
      ...above.map(
        (row) =>
          `| \`${row.sourceKey}\` | ${bytes(row.outputBytes)} | ${row.width}×${row.height} |`,
      ),
      '',
    );
  }

  if (failed.length > 0) {
    lines.push(
      '## Failed or conflicted',
      '',
      'See `failed.json` for the full detail. Re-run the same command to retry only these images.',
      '',
      '| Source | Status | Error |',
      '|---|---|---|',
      ...failed.map((row) => `| \`${row.sourceKey}\` | ${row.status} | ${row.error ?? ''} |`),
      '',
    );
  }

  lines.push(
    '## Verification',
    '',
    'Every upload was verified with `HeadObject`: the object must exist, report the exact byte length written, and carry `Content-Type: image/webp`.',
    '',
  );

  writeFileSync(path.join(opts.reportsDir, 'migration-report.md'), `${lines.join('\n')}\n`, 'utf8');
}

async function runDryRun(opts, source, objects) {
  const previewObjects = objects.slice(0, Math.min(objects.length, opts.limit));
  const samples = [];

  for (const object of previewObjects.slice(0, opts.sample)) {
    try {
      const original = await downloadSource(source, opts.sourceBucket, object.key);
      const optimized = await optimizeToWebp(original, opts.targetBytes);
      samples.push({
        sourceKey: object.key,
        originalBytes: original.length,
        optimizedBytes: optimized.buffer.length,
        quality: optimized.quality,
        width: optimized.width,
        height: optimized.height,
        underTarget: !optimized.aboveTarget,
      });
      console.log(
        `  sampled ${object.key}: ${bytes(original.length)} → ${bytes(optimized.buffer.length)} q${optimized.quality} ${optimized.width}×${optimized.height}`,
      );
    } catch (error) {
      samples.push({ sourceKey: object.key, error: error.message });
      console.warn(`  sample failed ${object.key}: ${error.message}`);
    }
  }

  const summary = {
    total: previewObjects.length,
    plannedUploads: previewObjects.length,
    sampleCount: samples.length,
  };
  writeDryRunReport(opts, previewObjects, opts.skipped, opts.collisions, samples, summary);

  console.log('');
  console.log('Dry run complete. Nothing was uploaded.');
  console.log(`  Source:      s3://${opts.sourceBucket}/${opts.sourcePrefix}`);
  console.log(`  Destination: s3://${opts.bucket}/${opts.destPrefix} (${opts.region})`);
  console.log(`  Images:      ${previewObjects.length}`);
  console.log(
    `  Total size:  ${bytes(previewObjects.reduce((sum, object) => sum + object.size, 0))}`,
  );
  console.log(`  Report:      ${path.join(opts.reportsDir, 'dry-run-report.md')}`);
}

async function runExecute(opts, source, objects) {
  const destination = createDestinationClient(opts.region);

  try {
    await destination.send(new HeadBucketCommand({ Bucket: opts.bucket }));
  } catch (error) {
    throw new Error(
      `Destination bucket "${opts.bucket}" is not reachable in ${opts.region}: ${error.message}`,
    );
  }

  const stateFile = createStateStore(opts.stateDir, opts.fresh);
  const state = loadState(stateFile, opts);
  const log = createLogger(opts.stateDir);
  const startedAt = state.startedAt ?? new Date().toISOString();
  state.startedAt = startedAt;

  // One save at a time; workers finish out of order but the file stays valid.
  let saveChain = Promise.resolve();
  const saveState = () => {
    state.updatedAt = new Date().toISOString();
    saveChain = saveChain.then(() => writeAtomicJson(stateFile, state));
    return saveChain;
  };

  const successfulStatuses = new Set(['uploaded', 'already-exists']);
  const queue = objects
    .slice(0, Math.min(objects.length, opts.limit))
    .filter((object) => !(opts.resume && successfulStatuses.has(state.items[object.key]?.status)));

  log(
    `Starting migration: ${queue.length} image(s) queued, ${objects.length} discovered, ` +
      `${successfulStatuses.size} success state(s) resumable.`,
  );
  log(`Destination: s3://${opts.bucket}/${opts.destPrefix} (${opts.region})`);

  let processed = 0;

  await runPool(queue, opts.concurrency, async (object) => {
    const destinationKey = destinationKeyFor(object.key, opts.destPrefix);
    const prefix = `[${processed + 1}/${queue.length}]`;

    try {
      const existing = await headOrNull(destination, opts.bucket, destinationKey);
      if (existing) {
        if (migratedByUs(existing, object.key)) {
          state.items[object.key] = {
            status: 'already-exists',
            destinationKey,
            originalBytes: object.size,
            outputBytes: existing.ContentLength ?? null,
            quality: Number(existing.Metadata?.['webp-quality']) || null,
            width: Number(existing.Metadata?.width) || null,
            height: Number(existing.Metadata?.height) || null,
            aboveTarget: (existing.ContentLength ?? 0) > opts.targetBytes,
            attempts: 0,
            updatedAt: new Date().toISOString(),
          };
          await saveState();
          processed += 1;
          log(`${prefix} already-present ${object.key} (${bytes(existing.ContentLength ?? 0)})`);
          return;
        }

        if (!opts.overwriteExisting) {
          state.items[object.key] = {
            status: 'conflict',
            destinationKey,
            originalBytes: object.size,
            outputBytes: existing.ContentLength ?? null,
            attempts: 0,
            error:
              'Destination object exists and was not created by this migration. ' +
              'Re-run with --overwrite-existing only after inspecting it.',
            updatedAt: new Date().toISOString(),
          };
          await saveState();
          processed += 1;
          log(`${prefix} CONFLICT ${object.key} -> ${destinationKey} (left untouched)`);
          return;
        }
      }

      const original = await downloadSource(source, opts.sourceBucket, object.key);
      const optimized = await optimizeToWebp(original, opts.targetBytes);

      const upload = async () => {
        await destination.send(
          new PutObjectCommand({
            Bucket: opts.bucket,
            Key: destinationKey,
            Body: optimized.buffer,
            ContentType: WEBP_CONTENT_TYPE,
            CacheControl: 'public, max-age=31536000, immutable',
            Metadata: {
              'migrated-from': encodeURIComponent(object.key),
              'original-bytes': String(original.length),
              'webp-quality': String(optimized.quality),
              width: String(optimized.width),
              height: String(optimized.height),
              'above-target': String(optimized.aboveTarget),
            },
          }),
        );

        const head = await destination.send(
          new HeadObjectCommand({ Bucket: opts.bucket, Key: destinationKey }),
        );
        if (head.ContentLength !== optimized.buffer.length) {
          throw new Error(
            `Upload verification failed: expected ${optimized.buffer.length} bytes, found ${head.ContentLength}.`,
          );
        }
        if (head.ContentType !== WEBP_CONTENT_TYPE) {
          throw new Error(`Upload verification failed: content type is ${head.ContentType}.`);
        }
      };

      await withRetry(`upload ${destinationKey}`, upload);

      state.items[object.key] = {
        status: 'uploaded',
        destinationKey,
        originalBytes: original.length,
        outputBytes: optimized.buffer.length,
        quality: optimized.quality,
        width: optimized.width,
        height: optimized.height,
        aboveTarget: optimized.aboveTarget,
        attempts: 1,
        updatedAt: new Date().toISOString(),
      };
      await saveState();
      processed += 1;
      log(
        `${prefix} uploaded ${object.key} -> ${destinationKey} ` +
          `(${bytes(original.length)} -> ${bytes(optimized.buffer.length)}, q${optimized.quality}, ` +
          `${optimized.width}x${optimized.height}${optimized.aboveTarget ? ', ABOVE TARGET' : ''})`,
      );
    } catch (error) {
      state.items[object.key] = {
        status: 'failed',
        destinationKey,
        originalBytes: object.size,
        attempts: (state.items[object.key]?.attempts ?? 0) + 1,
        error: `${error.name ?? 'Error'}: ${error.message}`,
        updatedAt: new Date().toISOString(),
      };
      await saveState();
      processed += 1;
      log(`${prefix} FAILED ${object.key}: ${error.message}`);
    }
  });

  await saveChain;
  state.finishedAt = new Date().toISOString();
  await saveState();

  const summary = summarize(state, objects);
  writeFinalReports(opts, objects, state, summary, startedAt);

  log(
    `Done. successful=${summary.uploaded} already=${summary.alreadyExists} ` +
      `failed=${summary.failed} conflicts=${summary.conflicts} above50KB=${summary.aboveTarget}`,
  );
  log(
    `Sizes: original=${bytes(summary.originalBytes)} optimized=${bytes(summary.optimizedBytes)} ` +
      `saved=${bytes(summary.savedBytes)}`,
  );
  log(`Report: ${path.join(opts.reportsDir, 'migration-report.md')}`);

  if (summary.failed > 0 || summary.conflicts > 0) process.exitCode = 1;
}

function destinationKeyFor(sourceKey, destPrefix) {
  return destinationKey(sourceKey, destPrefix);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const source = createSourceClient();

  console.log(`Listing s3://${opts.sourceBucket}/${opts.sourcePrefix} …`);
  const listed = await listSourceObjects(source, opts.sourceBucket, opts.sourcePrefix);

  const skipped = [];
  const objects = [];
  for (const object of listed) {
    if (IMAGE_EXTENSION.test(object.key)) objects.push(object);
    else skipped.push(object.key);
  }

  const destinations = new Map();
  const collisions = [];
  for (const object of objects) {
    const key = destinationKeyFor(object.key, opts.destPrefix);
    if (destinations.has(key)) {
      const entry = collisions.find((collision) => collision.destinationKey === key);
      if (entry) entry.sources.push(object.key);
      else collisions.push({ destinationKey: key, sources: [destinations.get(key), object.key] });
    } else {
      destinations.set(key, object.key);
    }
  }

  if (collisions.length > 0) {
    throw new Error(
      `Refusing to continue: ${collisions.length} destination key collision(s). See the dry-run report.`,
    );
  }

  console.log(
    `Found ${listed.length} object(s): ${objects.length} image(s), ${skipped.length} non-image(s), ` +
      `${bytes(objects.reduce((sum, object) => sum + object.size, 0))} total.`,
  );

  if (!opts.execute) {
    opts.skipped = skipped;
    opts.collisions = collisions;
    await runDryRun(opts, source, objects);
    return;
  }

  await runExecute(opts, source, objects);
}

main().catch((error) => {
  console.error(`\nMigration aborted: ${error.message}`);
  process.exitCode = 1;
});
