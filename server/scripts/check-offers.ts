import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { loadConfig } from '../src/config';
process.loadEnvFile('../.env');
const cfg = loadConfig();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: cfg.databaseUrl }) });
async function main() {
  const offers = await prisma.jobOffer.findMany({
    where: { jobId: 'ce2fe745-177b-4bfc-a085-18bffc6038d0' },
  });
  console.log('OFFERS_FOR_NEW_JOB:', JSON.stringify(offers));
  const notifs = await prisma.notification.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  console.log('NOTIFS:', JSON.stringify(notifs.map((n) => ({ type: n.type, title: n.title, createdAt: n.createdAt })), null, 1));
}
main().finally(() => prisma.$disconnect());
