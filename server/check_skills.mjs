import { PrismaClient } from './src/generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
const services = await prisma.service.findMany({ include: { skills: { orderBy: { sortOrder: 'asc' } } } });
for (const s of services) {
  console.log(`\n=== ${s.name} (${s.slug}) ===`);
  for (const sk of s.skills) {
    console.log(`  [${sk.sortOrder}] ${sk.name} (${sk.slug}) active=${sk.isActive}`);
  }
}
await prisma.$disconnect();
