import { createServer } from 'node:http';
import { API_PREFIX } from '@samona/config';
import { createApp } from './app';
import { logger } from './common/logger';
import { loadConfig, loadEnvFile } from './config';
import { createServices } from './context';
import { createPrismaClient } from './database/prisma';
import { createRedisClient } from './database/redis';
import { createRealtimeService } from './realtime/gateway';

/**
 * Process entry point: load config, open connections, serve, shut down cleanly.
 */
async function main(): Promise<void> {
  loadEnvFile();
  const config = loadConfig();

  const prisma = createPrismaClient(config.databaseUrl);
  let redis: ReturnType<typeof createRedisClient> | null = null;
  try {
    const client = createRedisClient(config.redisUrl);
    await client.connect();
    if (client.status === 'ready') {
      redis = client;
      logger.info('Connected to Redis.');
    } else {
      logger.error(`Redis status: ${client.status}. Falling back to in-memory rate limiting.`);
      await client.quit().catch(() => undefined);
    }
  } catch (error) {
    logger.error('Could not connect to Redis. Falling back to in-memory rate limiting.', error);
  }

  // Realtime is built before the services so the lifecycle domains can push
  // on it, then handed the HTTP server once that exists.
  const realtime = createRealtimeService(config);

  const services = createServices(prisma, config, realtime);
  // `redis` is passed even if the connection failed above: ioredis queues and
  // reconnects, and the limiters degrade to in-process counters if it cannot.
  const app = createApp({ config, services, rateLimit: { redis } });

  const httpServer = createServer(app);

  // The gateway authenticates with the same token verifier and auth service
  // the REST API uses, sharing the JWKS cache.
  realtime.attach(httpServer, {
    verifier: services.tokenVerifier,
    authService: services.auth,
  });

  // Slowloris and friends: a client that opens a connection and dribbles bytes
  // holds a socket forever unless the server bounds how long it will wait.
  // headersTimeout must exceed requestTimeout or headers can time out first.
  httpServer.requestTimeout = 30_000;
  httpServer.headersTimeout = 35_000;
  httpServer.keepAliveTimeout = 15_000;
  // Bound the header table itself; the default is generous for an API.
  httpServer.maxHeadersCount = 100;

  // Age out unreplied offers and requests no one took, independent of any
  // traffic. Each request also lazily re-checks expiry on read.
  const expirySweeper = setInterval(() => {
    void services.jobs.runExpirySweeper().catch((error: unknown) => {
      logger.error('Expiry sweeper failed.', error);
    });
  }, 30_000);
  expirySweeper.unref();

  httpServer.listen(config.port, () => {
    logger.info(`SAMONA API listening on http://localhost:${config.port}${API_PREFIX}`);
  });

  /** Close connections in reverse order of opening, then exit. */
  async function shutdown(signal: string): Promise<void> {
    logger.info(`Received ${signal}, shutting down.`);

    // Stop accepting work before tearing down the resources in-flight requests use.
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await realtime.close();
    clearInterval(expirySweeper);
    if (redis) await redis.quit().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);

    logger.info('Shutdown complete.');
    process.exit(0);
  }

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      void shutdown(signal);
    });
  }
}

main().catch((error: unknown) => {
  logger.error('Failed to start the server.', error);
  process.exit(1);
});
