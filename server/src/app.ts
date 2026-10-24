import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors, { type CorsOptions } from 'cors';
import helmet from 'helmet';
import { API_PREFIX } from '@samona/config';
import { ApiErrorCode } from '@samona/types';
import type { AppConfig } from './config';
import type { Services } from './context';
import type { PrismaClient } from './database/prisma';
import { createHttpError, errorHandler, notFoundHandler, requestId } from './common';
import {
  blockPrototypePollution,
  enforceJsonContentType,
  limitJsonShape,
} from './common/middleware/request-guards';
import { createLimiters, type RateLimiterDeps } from './common/middleware/rate-limit';
import { createApiRouter } from './routes';

export interface CreateAppOptions {
  config: AppConfig;
  services: Services;
  /**
   * The process-wide Prisma client.
   *
   * Domain services receive it through their constructors; the admin router
   * needs it directly for dashboard queries and session lookups, so it is
   * threaded through here rather than hung off `services` informally.
   */
  prisma?: PrismaClient;
  /**
   * Rate limiter backing store. Omitting it still limits, using in-process
   * counters — the default is deliberately safe, so forgetting to wire Redis
   * degrades protection rather than removing it. Pass `{ disabled: true }`
   * only in tests asserting unrelated behaviour.
   */
  rateLimit?: RateLimiterDeps;
}

/**
 * Builds the CORS policy.
 *
 * The mobile apps are not browsers and send no Origin, so CORS exists here for
 * future web surfaces and for the dev tooling. In production an unlisted origin
 * is rejected outright rather than reflected — reflecting an arbitrary origin
 * with credentials enabled is equivalent to having no policy at all.
 */
function corsOptions(config: AppConfig): CorsOptions {
  if (!config.isProduction) {
    return { origin: true, credentials: true, maxAge: 600 };
  }

  return {
    origin(origin, callback) {
      // No Origin header: native apps, curl, server-to-server. Not a browser,
      // so the same-origin policy this protects is not in play.
      if (!origin) {
        callback(null, true);
        return;
      }
      if (config.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(createHttpError(403, ApiErrorCode.FORBIDDEN, 'Origin is not allowed.'));
    },
    credentials: true,
    maxAge: 600,
  };
}

/**
 * Builds the Express application.
 *
 * Kept separate from `index.ts` so tests can construct an app without opening
 * sockets or connecting to PostgreSQL and Redis.
 *
 * Order matters and is deliberate: cheap rejections run before expensive work.
 * Security headers, then the caller's identity, then the global budget, then
 * body parsing, then shape guards, then routing. A request that will be refused
 * should be refused before its body is parsed.
 */
export function createApp({ config, services, prisma, rateLimit }: CreateAppOptions): Express {
  const app = express();

  // Behind a load balancer, req.ip is the proxy unless we trust one hop. Rate
  // limiting keyed on the wrong IP is either useless or a self-inflicted DoS.
  // Exactly one hop is trusted: `true` would let a client forge X-Forwarded-For.
  if (config.isProduction) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  // No etag on API responses: it leaks nothing useful and invites cache probing.
  app.disable('etag');

  app.use(
    helmet({
      // This origin serves JSON, never HTML, so a restrictive CSP costs nothing.
      contentSecurityPolicy: {
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  app.use(cors(corsOptions(config)));
  app.use(requestId);
  app.use(cookieParser());

  // Built once at startup; a limiter created per request would keep no state.
  const limiters = createLimiters(rateLimit ?? { redis: null });

  // Global budget first: it is the cheapest possible rejection.
  app.use(limiters.global);

  app.use(enforceJsonContentType);
  // 100kb is generous for this API's payloads. Uploads must go to object
  // storage via a signed URL, never through a JSON body.
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  app.use(blockPrototypePollution);
  app.use(limitJsonShape());

  app.use(API_PREFIX, createApiRouter(services, limiters, { prisma, redis: rateLimit?.redis ?? null }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
