import 'dotenv/config';
import { connectDb, disconnectDb } from '../lib/db';
import { DEFAULT_SEED_PASSWORD, seedDefaults } from '../lib/seed-defaults';

async function main() {
  await connectDb();
  const result = await seedDefaults();
  console.log('Seed OK — domyślne konta i stanowiska:');
  console.log(`  Domyślne hasło kont seed: ${DEFAULT_SEED_PASSWORD}`);
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
