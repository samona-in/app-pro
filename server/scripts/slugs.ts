import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { loadConfig } from '../src/config';
process.loadEnvFile('../.env');
const cfg = loadConfig();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: cfg.databaseUrl }) });
async function main() {
  const services = await prisma.service.findMany({ include: { skills: true } });
  console.log('SERVICES_AND_SKILLS:', JSON.stringify(services));
}
main().finally(() => prisma.$disconnect());
