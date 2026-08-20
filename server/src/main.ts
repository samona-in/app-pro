import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { API_PREFIX } from '@samona/config';
import { AppModule } from './app.module';
import type { AppConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService<AppConfig, true>);
  const logger = new Logger('Bootstrap');

  // Versioned prefix shared with the API client so both sides agree on one path.
  app.setGlobalPrefix(API_PREFIX.replace(/^\//, ''));

  const corsOrigins = config.get('corsOrigins', { infer: true });
  app.enableCors({
    // Empty list in development means "reflect the request origin"; production
    // must configure CORS_ORIGINS explicitly.
    origin: corsOrigins.length > 0 ? corsOrigins : !config.get('isProduction', { infer: true }),
    credentials: true,
  });

  // No global class-validator ValidationPipe: SAMONA validates with Zod schemas
  // shared between client and server via `@samona/validation`. Routes opt in
  // with `new ZodValidationPipe(schema)` (see src/common/pipes).

  // Lets Nest run onModuleDestroy hooks so Prisma and Redis close cleanly.
  app.enableShutdownHooks();

  const port = config.get('port', { infer: true });
  await app.listen(port);
  logger.log(`SAMONA API listening on http://localhost:${port}${API_PREFIX}`);
}

void bootstrap();
