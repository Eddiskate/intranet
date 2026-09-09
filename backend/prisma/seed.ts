import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { seedDefaults } from '../src/lib/seed-defaults';

const prisma = new PrismaClient();

async function main() {
  const result = await seedDefaults(prisma);
  console.log('Seed OK — domyślne konta i stanowiska:');
  for (const g of result.summary) {
    console.log(`  ${g.name}: ${g.members.join(', ') || 'brak'}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
