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
}

/** Shared infrastructure plus the service layer built on top of it. */
export interface AppContext {
  config: AppConfig;
  prisma: PrismaClient;
  redis: Redis;
  services: Services;
}

export function createServices(prisma: PrismaClient, config: AppConfig): Services {
  const deps = { prisma };

  return {
    auth: createAuthService({ prisma, signupDefaultRole: config.signupDefaultRole }),
    tokenVerifier: createTokenVerifier({
      supabaseUrl: config.supabaseUrl,
      jwtSecret: config.supabaseJwtSecret,
    }),
    users: createUsersService(deps),
    pros: createProsService(deps),
    customers: createCustomersService(deps),
    services: createServicesService(deps),
    jobs: createJobsService(deps),
    matching: createMatchingService(deps),
    locations: createLocationsService(deps),
    payments: createPaymentsService(deps),
    earnings: createEarningsService(deps),
    notifications: createNotificationsService(deps),
    reviews: createReviewsService(deps),
  };
}
