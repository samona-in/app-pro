import type { AppConfig } from './config';
import type { PrismaClient } from './database/prisma';
import type { Redis } from './database/redis';

import { AuthService } from './auth/auth.service';
import { UsersService } from './users/users.service';
import { ProsService } from './pros/pros.service';
import { CustomersService } from './customers/customers.service';
import { ServicesService } from './services/services.service';
import { JobsService } from './jobs/jobs.service';
import { MatchingService } from './matching/matching.service';
import { LocationsService } from './locations/locations.service';
import { PaymentsService } from './payments/payments.service';
import { EarningsService } from './earnings/earnings.service';
import { NotificationsService } from './notifications/notifications.service';
import { ReviewsService } from './reviews/reviews.service';

/**
 * Every domain service, constructed once per process.
 *
 * This replaces a DI container with plain composition: dependencies are passed
 * explicitly, which keeps wiring greppable and makes services trivial to
 * construct in tests with a stub client.
 */
export interface Services {
  auth: AuthService;
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

export function createServices(prisma: PrismaClient): Services {
  return {
    auth: new AuthService(prisma),
    users: new UsersService(prisma),
    pros: new ProsService(prisma),
    customers: new CustomersService(prisma),
    services: new ServicesService(prisma),
    jobs: new JobsService(prisma),
    matching: new MatchingService(prisma),
    locations: new LocationsService(prisma),
    payments: new PaymentsService(prisma),
    earnings: new EarningsService(prisma),
    notifications: new NotificationsService(prisma),
    reviews: new ReviewsService(prisma),
  };
}
