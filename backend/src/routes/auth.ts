import { Router } from 'express';
import { z } from 'zod';
import { cols, toObjectId } from '../lib/db';
import { hashPassword, requireAuth, signToken, verifyPassword, type AuthedRequest } from '../lib/auth';
import { loadUserWithGroups } from '../lib/relations';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse({
    ...req.body,
    email: typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : req.body.email,
  });
  if (!parsed.success) {
    res.status(400).json({ error: 'Podaj e-mail i hasło' });
    return;
  }

  const user = await cols.users().findOne({ email: parsed.data.email });
  if (!user?.passwordHash) {
    res.status(401).json({ error: 'Nieprawidłowy e-mail lub hasło' });
    return;
  }

  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: 'Nieprawidłowy e-mail lub hasło' });
    return;
  }

  const authUser = {
    id: user._id.toHexString(),
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
  };

  const profile = await loadUserWithGroups(user._id);
  res.json({
    token: signToken(authUser),
    user: profile,
  });
});

router.get('/me', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const profile = await loadUserWithGroups(toObjectId(req.user!.id));
    if (!profile) {
      res.status(404).json({ error: 'Użytkownik nie znaleziony' });
      return;
    }
    res.json(profile);
  } catch {
    res.status(404).json({ error: 'Użytkownik nie znaleziony' });
  }
});

/** Jednorazowe ustawienie hasła gdy użytkownik jeszcze go nie ma (np. po migracji) — tylko admin z JWT */
router.post('/set-password', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = z
    .object({
      userId: z.string().min(1),
      password: z.string().min(4),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'Podaj userId i hasło (min. 4 znaki)' });
    return;
  }

  if (req.user!.role !== 'ADMIN' && req.user!.id !== parsed.data.userId) {
    res.status(403).json({ error: 'Brak uprawnień' });
    return;
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const result = await cols.users().updateOne(
    { _id: toObjectId(parsed.data.userId) },
    { $set: { passwordHash, updatedAt: new Date() } }
  );

  if (result.matchedCount === 0) {
    res.status(404).json({ error: 'Użytkownik nie znaleziony' });
    return;
  }

  res.json({ ok: true });
});

export default router;
