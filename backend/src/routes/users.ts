import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { USER_DEPARTMENTS } from '../data/departments';

const router = Router();

const userSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  department: z.enum(USER_DEPARTMENTS as unknown as [string, ...string[]]),
  role: z.enum(['STAFF', 'AGENT', 'ADMIN']).optional(),
  groupIds: z.array(z.string()).optional(),
});

router.get('/departments', (_req, res) => {
  res.json(USER_DEPARTMENTS);
});

router.get('/', async (_req, res) => {
  const users = await prisma.user.findMany({
    include: {
      groups: { include: { group: true } },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });
  res.json(users);
});

router.get('/:id', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: {
      groups: { include: { group: true } },
    },
  });
  if (!user) {
    res.status(404).json({ error: 'Użytkownik nie znaleziony' });
    return;
  }
  res.json(user);
});

router.post('/', async (req, res) => {
  const parsed = userSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { groupIds = [], ...data } = parsed.data;

  const user = await prisma.user.create({
    data: {
      ...data,
      role: data.role ?? 'STAFF',
      groups: {
        create: groupIds.map((groupId) => ({ groupId })),
      },
    },
    include: {
      groups: { include: { group: true } },
    },
  });

  res.status(201).json(user);
});

router.put('/:id', async (req, res) => {
  const parsed = userSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { groupIds, ...data } = parsed.data;
  const userId = req.params.id;

  try {
    if (groupIds) {
      await prisma.groupMember.deleteMany({ where: { userId } });
      if (groupIds.length) {
        await prisma.groupMember.createMany({
          data: groupIds.map((groupId) => ({ userId, groupId })),
        });
      }
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        department: data.department,
        role: data.role,
      },
      include: {
        groups: { include: { group: true } },
      },
    });

    res.json(user);
  } catch {
    res.status(404).json({ error: 'Użytkownik nie znaleziony' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.groupMember.deleteMany({ where: { userId: req.params.id } });
    await prisma.user.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch {
    res.status(404).json({ error: 'Użytkownik nie znaleziony' });
  }
});

export default router;
