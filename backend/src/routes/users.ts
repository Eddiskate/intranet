import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { USER_DEPARTMENTS } from '../data/departments';
import { hashPassword, requireAuth } from '../lib/auth';
import { cols, routeParam, toObjectId } from '../lib/db';
import { loadUserWithGroups } from '../lib/relations';
import type { UserRole } from '../types';

const router = Router();

const userSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  department: z.enum(USER_DEPARTMENTS as unknown as [string, ...string[]]),
  role: z.enum(['USER', 'STAFF', 'AGENT', 'ADMIN']).optional(),
  groupIds: z.array(z.string()).optional(),
  password: z.string().optional(),
});

router.get('/departments', (_req, res) => {
  res.json(USER_DEPARTMENTS);
});

router.use(requireAuth);

router.get('/', async (_req, res) => {
  const users = await cols.users().find().sort({ lastName: 1, firstName: 1 }).toArray();
  const payload = await Promise.all(users.map((u) => loadUserWithGroups(u._id)));
  res.json(payload);
});

router.get('/:id', async (req, res) => {
  try {
    const user = await loadUserWithGroups(toObjectId(routeParam(req.params.id)));
    if (!user) {
      res.status(404).json({ error: 'Użytkownik nie znaleziony' });
      return;
    }
    res.json(user);
  } catch {
    res.status(404).json({ error: 'Użytkownik nie znaleziony' });
  }
});

router.post('/', async (req, res) => {
  const parsed = userSchema.safeParse({
    ...req.body,
    email: typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : req.body.email,
  });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { groupIds = [], password, ...data } = parsed.data;
  const plainPassword = password?.trim();
  if (!plainPassword || plainPassword.length < 4) {
    res.status(400).json({ error: 'Hasło jest wymagane dla nowego użytkownika (min. 4 znaki)' });
    return;
  }

  const now = new Date();
  const _id = new ObjectId();
  const passwordHash = await hashPassword(plainPassword);

  try {
    await cols.users().insertOne({
      _id,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      department: data.department,
      role: (data.role ?? 'STAFF') as UserRole,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    });
  } catch {
    res.status(409).json({ error: 'Użytkownik z tym e-mailem już istnieje' });
    return;
  }

  if (groupIds.length) {
    await cols.members().insertMany(
      groupIds.map((groupId) => ({
        _id: new ObjectId(),
        userId: _id,
        groupId: toObjectId(groupId),
      }))
    );
  }

  res.status(201).json(await loadUserWithGroups(_id));
});

router.put('/:id', async (req, res) => {
  const parsed = userSchema.safeParse({
    ...req.body,
    email: typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : req.body.email,
  });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { groupIds, password, ...data } = parsed.data;

  let userId: ObjectId;
  try {
    userId = toObjectId(routeParam(req.params.id));
  } catch {
    res.status(404).json({ error: 'Użytkownik nie znaleziony' });
    return;
  }

  const existing = await cols.users().findOne({ _id: userId });
  if (!existing) {
    res.status(404).json({ error: 'Użytkownik nie znaleziony' });
    return;
  }

  if (groupIds) {
    await cols.members().deleteMany({ userId });
    if (groupIds.length) {
      await cols.members().insertMany(
        groupIds.map((groupId) => ({
          _id: new ObjectId(),
          userId,
          groupId: toObjectId(groupId),
        }))
      );
    }
  }

  const $set: Record<string, unknown> = {
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    department: data.department,
    ...(data.role ? { role: data.role as UserRole } : {}),
    updatedAt: new Date(),
  };

  if (password?.trim()) {
    if (password.trim().length < 4) {
      res.status(400).json({ error: 'Hasło musi mieć min. 4 znaki' });
      return;
    }
    $set.passwordHash = await hashPassword(password.trim());
  }

  await cols.users().updateOne({ _id: userId }, { $set });

  res.json(await loadUserWithGroups(userId));
});

router.delete('/:id', async (req, res) => {
  try {
    const userId = toObjectId(routeParam(req.params.id));
    await cols.members().deleteMany({ userId });
    const result = await cols.users().deleteOne({ _id: userId });
    if (result.deletedCount === 0) {
      res.status(404).json({ error: 'Użytkownik nie znaleziony' });
      return;
    }
    res.status(204).send();
  } catch {
    res.status(404).json({ error: 'Użytkownik nie znaleziony' });
  }
});

export default router;
