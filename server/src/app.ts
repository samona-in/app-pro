import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { API_PREFIX } from '@samona/config';
import type { AppConfig } from './config';
import type { Services } from './context';
import { errorHandler, notFoundHandler, requestId } from './common';
import { createApiRouter } from './routes';

export interface CreateAppOptions {
  config: AppConfig;
  services: Services;
}

/**
 * Builds the Express application.
 *
 * Kept separate from `index.ts` so tests can construct an app without opening
 * sockets or connecting to PostgreSQL and Redis.
 *
 * Middleware order matters: security headers and correlation ids run first, the
 * API router next, then the 404 fallback, and the error handler last — Express
 * only recognises a 4-argument function as an error handler, and only at the
 * end of the chain.
 */
export function createApp({ config, services }: CreateAppOptions): Express {
  const app = express();

  // Trust the proxy in production so req.ip and protocol reflect the client.
  if (config.isProduction) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      // An empty list in development reflects the request origin; production
      // must configure CORS_ORIGINS explicitly.
      origin: config.corsOrigins.length > 0 ? config.corsOrigins : !config.isProduction,
      credentials: true,
    }),
  );

  // Bounded body size: an unbounded parser is a trivial denial-of-service.
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.use(requestId);

  app.use(API_PREFIX, createApiRouter(services));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
