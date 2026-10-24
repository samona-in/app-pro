import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { loadConfig } from '../src/config';

process.loadEnvFile('../.env');
const cfg = loadConfig();
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: cfg.databaseUrl }),
});

async function main() {
  const pros = await prisma.proProfile.findMany({
    select: {
      id: true,
      userId: true,
      displayName: true,
      isOnline: true,
      latitude: true,
      longitude: true,
      serviceRadiusKm: true,
      pushToken: true,
      pushDeviceId: true,
      jobAlertsEnabled: true,
      onboardingStatus: true,
    },
  });
  console.log('PROS:', JSON.stringify(pros, null, 1));

  const customers = await prisma.customerProfile.findMany({
    select: { id: true, displayName: true, latitude: true, longitude: true },
  });
  console.log('CUSTOMERS:', JSON.stringify(customers));

  const services = await prisma.service.findMany({ select: { id: true, name: true } });
  console.log('SERVICES:', JSON.stringify(services));

  const proSkills = await prisma.proSkill.findMany({
    select: { proProfileId: true, skill: { select: { name: true, serviceId: true } } },
  });
  console.log('PRO_SKILLS:', JSON.stringify(proSkills));

  const customerIds = customers.map((c) => c.id);
  console.log('CUSTOMER_IDS:', JSON.stringify(customerIds));

  const profiles = await prisma.profile.findMany({
    where: { customerProfile: { isNot: null } },
    select: { id: true, phone: true, email: true, fullName: true },
  });
  console.log('CUSTOMER_PHONES:', JSON.stringify(profiles));

  const openJobs = await prisma.job.findMany({
    where: { status: { in: ['REQUESTED', 'OFFERED'] } },
    select: { id: true, status: true, serviceId: true },
  });
  console.log('OPEN_JOBS:', JSON.stringify(openJobs));
}

main().finally(() => prisma.$disconnect());