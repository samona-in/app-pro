import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';
import { HealthModule } from './common/health/health.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { RealtimeModule } from './realtime/realtime.module';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProsModule } from './pros/pros.module';
import { CustomersModule } from './customers/customers.module';
import { ServicesModule } from './services/services.module';
import { JobsModule } from './jobs/jobs.module';
import { MatchingModule } from './matching/matching.module';
import { LocationsModule } from './locations/locations.module';
import { PaymentsModule } from './payments/payments.module';
import { EarningsModule } from './earnings/earnings.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReviewsModule } from './reviews/reviews.module';

/**
 * Composition root.
 *
 * Modules are organised by business domain, not by technical layer — there is
 * no global `controllers/` or `services/` folder (CLAUDE.md "Architecture").
 * The same backend serves the Pro app today and the Customer and Admin surfaces
 * later, so nothing here is Pro-specific.
 */
@Module({
  imports: [
    // Infrastructure
    ConfigModule,
    DatabaseModule,
    HealthModule,
    RealtimeModule,

    // Domains
    AuthModule,
    UsersModule,
    ProsModule,
    CustomersModule,
    ServicesModule,
    JobsModule,
    MatchingModule,
    LocationsModule,
    PaymentsModule,
    EarningsModule,
    NotificationsModule,
    ReviewsModule,
  ],
  providers: [
    // Applied to every route: one error envelope, one correlation id.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: RequestIdInterceptor },
  ],
})
export class AppModule {}
