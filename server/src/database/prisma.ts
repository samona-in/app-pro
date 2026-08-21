import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

/**
 * Creates the single Prisma client for the process.
 *
 * Prisma 7 connects through a driver adapter rather than a `url` in the schema,
 * so the connection string is passed in from validated config. Domain services
 * receive this client through the app context instead of constructing their
 * own, so the app holds exactly one connection pool.
 */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
}

export type { PrismaClient };
