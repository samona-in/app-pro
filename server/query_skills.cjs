require('dotenv').config({ path: '../.env' });
const { PrismaClient } = require('./src/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
prisma.service.findMany({ include: { skills: { orderBy: { sortOrder: 'asc' } } } })
  .then(services => {
    for (const s of services) {
      console.log(`\n=== ${s.name} (${s.slug}) ===`);
      for (const sk of s.skills) {
        console.log(`  [${sk.sortOrder}] ${sk.name} (${sk.slug}) active=${sk.isActive}`);
      }
    }
    return prisma.$disconnect();
  })
  .catch(e => { console.error(e.stack); process.exit(1); });
