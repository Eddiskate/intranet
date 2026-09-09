import 'dotenv/config';
import { connectDb, disconnectDb } from '../lib/db';
import { seedDefaults } from '../lib/seed-defaults';

async function main() {
  await connectDb();
  const result = await seedDefaults();
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
    await disconnectDb();
  });
