import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { seedDefaults } from '../lib/seed-defaults';

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
