import type { AppConfig } from './config';
import type { PrismaClient } from './database/prisma';
import type { Redis } from './database/redis';
import { JOB_DEFAULTS } from '@samona/config';
import { createBruteForceGuard } from './common';
import { logger } from './common/logger';

import { createAuthService, type AuthService } from './auth/auth.service';
import { createSupabaseAdminClient } from './auth/supabase-admin';
import { createTokenVerifier, type TokenVerifier } from './auth/token';
import { createUsersService, type UsersService } from './users/users.service';
import {
  createAccountDeletionService,
  type AccountDeletionService,
} from './users/account-deletion.service';
import { createProsService, type ProsService } from './pros/pros.service';

import { createCustomersService, type CustomersService } from './customers/customers.service';
import { createServicesService, type ServicesService } from './services/services.service';
import { createBannersService, type BannersService } from './banners/banners.service';
import { createJobsService, type JobsService } from './jobs/jobs.service';
import { createMatchingService, type MatchingService } from './matching/matching.service';
import { createMessagesService, type MessagesService } from './messages/messages.service';
import { createLocationsService, type LocationsService } from './locations/locations.service';
import { createGoogleGeocoder } from './locations/geocoding';
import { createGeocodeCache } from './locations/cache';
import { createAddressesService, type AddressesService } from './addresses/addresses.service';
import { createEarningsService, type EarningsService } from './earnings/earnings.service';
import {
  createNotificationsService,
  type NotificationsService,
} from './notifications/notifications.service';
import { createReviewsService, type ReviewsService } from './reviews/reviews.service';
import { createDocumentsService, type DocumentsService } from './documents/documents.service';
import { createStorageService, type StorageService } from './files/storage.service';
import type { RealtimeService } from './realtime/gateway';
import { S3Client } from '@aws-sdk/client-s3';

import { retentionPolicyFromConfig, findCategoriesMissingPeriod } from './retention/policy';
import { createLegalHoldService, type LegalHoldService } from './retention/legal-holds.service';
import {
  createCleanupAuditService,
  type CleanupAuditService,
} from './retention/cleanup-audit.service';
import { createOrphanService, type OrphanService } from './retention/orphan.service';
import {
  createRetentionCleanupService,
  type RetentionCleanupService,
} from './retention/cleanup.service';
import { createRetentionScheduler, type RetentionScheduler } from './retention/scheduler';
import { createTrackingService, type TrackingService } from './tracking/tracking.service';

/**
 * Every domain service, constructed once per process.
 *
 * This replaces a DI container with plain composition: dependencies are passed
 * explicitly, which keeps wiring greppable and makes services trivial to build
 * in tests with a stub client.
 */
export interface Services {
  auth: AuthService;
  /** Verifies Supabase access tokens. Shared so the JWKS cache is reused. */
  tokenVerifier: TokenVerifier;
  users: UsersService;
  pros: ProsService;
  customers: CustomersService;
  services: ServicesService;
  banners: BannersService;
  jobs: JobsService;
  messages: MessagesService;
  matching: MatchingService;
  locations: LocationsService;
  addresses: AddressesService;
  earnings: EarningsService;
  notifications: NotificationsService;
  reviews: ReviewsService;
  /** Submitted pro documents: upload handshake, review verdicts, presigned reads. */
  documents: DocumentsService;
  /** Presigned object-storage access for file uploads (selfies, avatars, documents). */
  storage: StorageService;
  /** Permanent account deletion: OTP re-auth, single-use authorization, sweeper. */
  accountDeletion: AccountDeletionService;
  /** Legal holds that protect records from automated and account-deletion purges. */
  legalHolds: LegalHoldService;
  /** Append-only, PII-free audit of retention cleanup operations. */
  cleanupAudit: CleanupAuditService;
  /** S3 orphan scanner used by the job-image retention category. */
  orphan: OrphanService;
  /** The retention sweep engine (dry-run by default; destructive when enabled). */
  retention: RetentionCleanupService;
  /** Scheduler that periodically runs the retention sweep. */
  retentionScheduler: RetentionScheduler;
  /** Live tracking for active jobs. */
  tracking: TrackingService;
  config: AppConfig;
}

/** Shared infrastructure plus the service layer built on top of it. */
export interface AppContext {
  config: AppConfig;
  prisma: PrismaClient;
  redis: Redis;
  services: Services;
}

/**
 * Builds the S3-backed storage service from config.
 *
 * Split out so the retention CLI constructs the exact same client as the
 * server rather than a second, possibly-divergent wiring.
 */
export function createStorageFromConfig(config: AppConfig): StorageService {
  return createStorageService({
    region: config.s3Region,
    selfiesBucket: config.s3BucketSelfies,
    jobImagesBucket: config.s3BucketJobImages,
    avatarsBucket: config.s3BucketAvatars,
    bannersBucket: config.s3BucketBanners,
    documentsBucket: config.s3BucketDocuments,
    publicBaseUrls: {
      selfies: config.s3PublicBaseUrlSelfies,
      jobImages: config.s3PublicBaseUrlJobImages,
      avatars: config.s3PublicBaseUrlAvatars,
      banners: config.s3PublicBaseUrlBanners,
    },
    // Production passes no credentials: the client resolves them from the
    // ambient provider chain, which on Fargate is the task role, so no key
    // material lives in the environment. Local development can point the same
    // client at an S3-compatible endpoint (Supabase Storage) with explicit
    // keys by configuring S3_ENDPOINT + S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY.
    s3: new S3Client(
      config.s3Credentials
        ? {
            region: config.s3Region,
            endpoint: config.s3Endpoint ?? undefined,
            forcePathStyle: config.s3ForcePathStyle,
            credentials: config.s3Credentials,
          }
        : { region: config.s3Region },
    ),
  });
}

export function createServices(
  prisma: PrismaClient,
  config: AppConfig,
  realtime: RealtimeService,
  redis: Redis | null,
): Services {
  const storage = createStorageFromConfig(config);
  const deps = { prisma, storage };

  // Order matters: jobs' dispatch drives matching, and jobs notifies through
  // realtime and push. Each service reads only what it received, so nothing is
  // reachable behind the composition boundary.
  const matching = createMatchingService({ prisma });
  const notifications = createNotificationsService({ prisma, config, realtime });
  const messages = createMessagesService({
    prisma,
    realtime,
    sendChatPush: (...args) => notifications.sendChatPush(...args),
  });
  const jobs = createJobsService({
    prisma,
    storage,
    matching,
    realtime,
    notifications,
    config,
    // Per-identity lockout for the start-work code, keyed by the job being
    // targeted. Degrades to counting-less when Redis is down (see the guard),
    // never failing open silently.
    startOtpGuard: createBruteForceGuard(redis, {
      maxAttempts: JOB_DEFAULTS.startOtpMaxAttempts,
    }),
  });

  // Retention: a policy built from validated config (all flags off and periods
  // unset by default), the hold service every purge consults, an append-only
  // audit, and the sweep engine. The scheduler only ever runs the sweep; it is
  // a no-op until an operator enables it.
  const retentionPolicy = retentionPolicyFromConfig(config.retention);
  const missingPeriods = findCategoriesMissingPeriod(retentionPolicy);
  if (missingPeriods.length > 0) {
    logger.warn(
      'Retention categories are enabled without a RETENTION_DAYS_* period; they ' +
        'will be skipped until a period is set (deletion stays disabled).',
      { categories: missingPeriods },
    );
  }
  const legalHolds = createLegalHoldService({ prisma });
  const cleanupAudit = createCleanupAuditService({ prisma });
  const orphan = createOrphanService({
    prisma,
    storage,
    safetyWindowDays: config.retention.safetyWindowDays,
  });
  const retention = createRetentionCleanupService({
    prisma,
    storage,
    redis,
    policy: retentionPolicy,
    legalHolds,
    audit: cleanupAudit,
    orphan,
  });
  const retentionScheduler = createRetentionScheduler({
    cleanup: retention,
    sweepMs: config.retention.sweepMs,
    enabled: config.retention.enabled,
    dryRunDefault: config.retention.dryRunDefault,
  });

  const tracking = createTrackingService({ prisma, realtime });
  tracking.startTrackingHeartbeatCheck();

  return {
    auth: createAuthService({ prisma }),
    tokenVerifier: createTokenVerifier({
      supabaseUrl: config.supabaseUrl,
      jwksUrl: config.supabaseJwksUrl,
      jwtSecret: config.supabaseJwtSecret,
    }),
    users: createUsersService(deps),
    pros: createProsService({ prisma, storage, jobs }),
    customers: createCustomersService(deps),
    services: createServicesService(deps),
    banners: createBannersService(deps.prisma),
    jobs,
    messages,
    matching,
    locations: createLocationsService({
      prisma,
      // Replaceable Google-backed geocoder (Places API v1 for search/details,
      // the Geocoding API for reverse). Swapping the factory keeps both
      // endpoints working without touching routes or the app (the provider
      // contract lives in locations/geocoding). The server key stays here.
      geocoding: createGoogleGeocoder({
        apiKey: config.googleMapsApiKey ?? '',
        geocodingBaseUrl: config.googleGeocodingBaseUrl,
        placesBaseUrl: config.googlePlacesBaseUrl,
        timeoutMs: config.geocodingTimeoutMs,
      }),
      // Bounds billed provider calls; a no-op when Redis is down.
      cache: createGeocodeCache(redis, config.geocodingCacheTtlMs),
    }),
    addresses: createAddressesService({ prisma }),
    earnings: createEarningsService(deps),
    notifications,
    reviews: createReviewsService(deps),
    documents: createDocumentsService({ prisma, storage }),
    storage,
    accountDeletion: createAccountDeletionService({
      prisma,
      config,
      storage,
      realtime,
      legalHolds,
      audit: cleanupAudit,
      // Null when no service-role key is configured: FULL_ACCOUNT deletion then
      // fails the DELETE_AUTH step loudly instead of silently skipping it.
      supabaseAdmin: createSupabaseAdminClient(config) ?? undefined,
    }),
    legalHolds,
    cleanupAudit,
    orphan,
    retention,
    retentionScheduler,
    tracking,
    config,
  };
}
