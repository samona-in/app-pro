import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { configuration } from './configuration';
import { validateEnv } from './env.validation';

/**
 * Global configuration. Env vars are validated once at boot; every other module
 * reads typed values through `ConfigService`.
 */
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Root `.env` so the whole monorepo shares one file in development.
      envFilePath: ['../.env', '.env'],
      validate: validateEnv,
      load: [configuration],
    }),
  ],
})
export class ConfigModule {}
