import { Router } from 'express';
import { cols } from '../lib/db';
import { seedDefaults } from '../lib/seed-defaults';

const router = Router();

router.get('/status', async (_req, res) => {
  const [groups, users, workers, tickets] = await Promise.all([
    cols.groups().countDocuments(),
    cols.users().countDocuments(),
    cols.workers().countDocuments(),
    cols.tickets().countDocuments(),
  ]);
  res.json({ groups, users, workers, tickets, needsSeed: groups === 0 });
});

router.post('/seed', async (_req, res) => {
  try {
    const result = await seedDefaults();
    res.json({
      ok: true,
      message: 'Domyślne grupy i agenci zostały wgrane.',
      groups: result.groups,
      users: result.users,
      summary: result.summary,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Nie udało się wgrać danych startowych' });
  }
});

export default router;
