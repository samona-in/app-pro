import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import type { AppConfig } from '../config/configuration';

/**
 * Prisma client bound to the Nest lifecycle.
 *
 * Prisma 7 connects through a driver adapter rather than a `url` in the schema,
 * so the connection string is injected from validated config here. Domain
 * services inject this service instead of constructing their own client, so the
 * app holds exactly one connection pool.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(configService: ConfigService<AppConfig, true>) {
    super({
      adapter: new PrismaPg({
        connectionString: configService.get('databaseUrl', { infer: true }),
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    // The pg driver adapter pools lazily, so this prepares the client rather
    // than proving the database is reachable — the first query does that.
    await this.$connect();
    this.logger.log('Prisma client ready.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
