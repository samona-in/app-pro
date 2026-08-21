import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { AppConfig } from '../config/configuration';

/**
 * Shared Redis connection.
 *
 * Intended for ephemeral state — pro presence, matching locks, rate limits,
 * Socket.IO scale-out. Durable state belongs in PostgreSQL: Redis never becomes
 * the source of truth (CLAUDE.md "Realtime").
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(configService: ConfigService<AppConfig, true>) {
    this.client = new Redis(configService.get('redisUrl', { infer: true }), {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.connect();
      this.logger.log('Connected to Redis.');
    } catch (error) {
      // Redis is not required to serve a request today, so a failure here is
      // logged loudly rather than crashing the process.
      this.logger.error(
        'Could not connect to Redis.',
        error instanceof Error ? error.stack : error,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
