import type { AppConfig } from './config';
import type { PrismaClient } from './database/prisma';
import type { Redis } from './database/redis';

import { createAuthService, type AuthService } from './auth/auth.service';
import { createTokenVerifier, type TokenVerifier } from './auth/token';
import { createUsersService, type UsersService } from './users/users.service';
import { createProsService, type ProsService } from './pros/pros.service';

import { createCustomersService, type CustomersService } from './customers/customers.service';
import { createServicesService, type ServicesService } from './services/services.service';
import { createJobsService, type JobsService } from './jobs/jobs.service';
import { createMatchingService, type MatchingService } from './matching/matching.service';
import { createLocationsService, type LocationsService } from './locations/locations.service';
import { createPaymentsService, type PaymentsService } from './payments/payments.service';
import { createEarningsService, type EarningsService } from './earnings/earnings.service';
import {
  createNotificationsService,
  type NotificationsService,
} from './notifications/notifications.service';
import { createReviewsService, type ReviewsService } from './reviews/reviews.service';
import { createStorageService, type StorageService } from './files/storage.service';
import type { RealtimeService } from './realtime/gateway';

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
  matching: MatchingService;
  locations: LocationsService;
  payments: PaymentsService;
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
): Services {
  const storage = createStorageService({
    supabaseUrl: config.supabaseUrl,
    supabaseSecretKey: config.supabaseSecretKey,
  });
  const deps = { prisma, storage };

  // Order matters: jobs' dispatch drives matching, payments settles through
  // jobs, and both notify through realtime. Each service reads only what it
  // received, so nothing is reachable behind the composition boundary.
  const matching = createMatchingService({ prisma });
  const jobs = createJobsService({ prisma, matching, realtime });

  return {
    auth: createAuthService({ prisma, signupDefaultRole: config.signupDefaultRole }),
    tokenVerifier: createTokenVerifier({
      supabaseUrl: config.supabaseUrl,
      jwksUrl: config.supabaseJwksUrl,
      jwtSecret: config.supabaseJwtSecret,
    }),
    users: createUsersService(deps),
    pros: createProsService(deps),
    customers: createCustomersService(deps),
    services: createServicesService(deps),
    jobs,
    matching,
    locations: createLocationsService(deps),
    payments: createPaymentsService({ prisma, jobs, realtime }),
    earnings: createEarningsService(deps),
    notifications: createNotificationsService(deps),
    reviews: createReviewsService(deps),
    storage,
  };
}
