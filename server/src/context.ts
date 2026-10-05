import type { AppConfig } from './config';
import type { PrismaClient } from './database/prisma';
import type { Redis } from './database/redis';
import { JOB_DEFAULTS } from '@samona/config';
import { createBruteForceGuard } from './common';

import { createAuthService, type AuthService } from './auth/auth.service';
import { createTokenVerifier, type TokenVerifier } from './auth/token';
import { createUsersService, type UsersService } from './users/users.service';
import { createProsService, type ProsService } from './pros/pros.service';

import { createCustomersService, type CustomersService } from './customers/customers.service';
import { createServicesService, type ServicesService } from './services/services.service';
import { createJobsService, type JobsService } from './jobs/jobs.service';
import { createMatchingService, type MatchingService } from './matching/matching.service';
import { createMessagesService, type MessagesService } from './messages/messages.service';
import { createLocationsService, type LocationsService } from './locations/locations.service';
import {
  createFailoverGeocoder,
  createNominatimGeocoder,
  createPhotonGeocoder,
} from './locations/geocoding';
import { createAddressesService, type AddressesService } from './addresses/addresses.service';
import { createEarningsService, type EarningsService } from './earnings/earnings.service';
import {
  createNotificationsService,
  type NotificationsService,
} from './notifications/notifications.service';
import { createReviewsService, type ReviewsService } from './reviews/reviews.service';
import { createStorageService, type StorageService } from './files/storage.service';
import type { RealtimeService } from './realtime/gateway';
import { S3Client } from '@aws-sdk/client-s3';

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
  jobs: JobsService;
  messages: MessagesService;
  matching: MatchingService;
  locations: LocationsService;
  addresses: AddressesService;
  earnings: EarningsService;
  notifications: NotificationsService;
  reviews: ReviewsService;
  /** Supabase Storage access for file uploads (selfies today, files later). */
  storage: StorageService;
}

/** Shared infrastructure plus the service layer built on top of it. */
export interface AppContext {
  config: AppConfig;
  prisma: PrismaClient;
  redis: Redis;
  services: Services;
}

export function createServices(
  prisma: PrismaClient,
  config: AppConfig,
  realtime: RealtimeService,
  redis: Redis | null,
): Services {
  const storage = createStorageService({
    region: config.s3Region,
    selfiesBucket: config.s3BucketSelfies,
    jobImagesBucket: config.s3BucketJobImages,
    avatarsBucket: config.s3BucketAvatars,
    publicBaseUrl: config.s3PublicBaseUrl,
    // No credentials passed: the client resolves them from the ambient
    // provider chain, which on Fargate is the task role. Constructing it here
    // keeps key material out of the environment entirely.
    s3: new S3Client({ region: config.s3Region }),
  });
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
    jobs,
    messages,
    matching,
    locations: createLocationsService({
      prisma,
      // Replaceable OSM-backed geocoder. Primary is Photon; requests fail over
      // to the Nominatim-compatible fallback when Photon is down. The fallback
      // is skipped when it points at the same instance as the primary.
      // Swapping the factories here keeps both endpoints working without
      // touching routes or the app (the provider contract lives in
      // locations/geocoding).
      geocoding: createFailoverGeocoder([
        // Nominatim (via Fastly CDN) is tried first — it is reliably reachable
        // from most networks. Photon's shared public instance (photon.komoot.io)
        // occasionally refuses connections; keeping it as a secondary means a
        // self-hosted Photon in production still gets used whenever Nominatim is
        // unavailable, without breaking development when Photon is unreachable.
        ...(config.geocodingFallbackUrl && config.geocodingFallbackUrl !== config.geocodingBaseUrl
          ? [
              createNominatimGeocoder({
                baseUrl: config.geocodingFallbackUrl,
                timeoutMs: config.geocodingTimeoutMs,
              }),
            ]
          : []),
        createPhotonGeocoder({
          baseUrl: config.geocodingBaseUrl,
          timeoutMs: config.geocodingTimeoutMs,
        }),
      ]),
    }),
    addresses: createAddressesService({ prisma }),
    earnings: createEarningsService(deps),
    notifications,
    reviews: createReviewsService(deps),
    storage,
  };
}
