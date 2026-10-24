import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const phone = process.argv[2];
  const role = process.argv[3] || 'SUPER_ADMIN';

  if (!phone) {
    console.error('Usage: tsx scripts/provision-admin.ts <phone> [role]');
    process.exit(1);
  }

  let profile = await prisma.profile.findUnique({ where: { phone } });
  
  if (!profile) {
    console.error('Profile not found for this phone. User must sign up first via the app.');
    process.exit(1);
  }

  await prisma.profile.update({
    where: { id: profile.id },
    data: { isAdmin: true },
  });

  const adminUser = await prisma.adminUser.upsert({
    where: { profileId: profile.id },
    create: {
      profileId: profile.id,
      role: role as any,
      isActive: true,
    },
    update: {
      role: role as any,
      isActive: true,
    },
  });

  console.log('Admin provisioned successfully:', {
    phone: profile.phone,
    adminUserId: adminUser.id,
    role: adminUser.role,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
