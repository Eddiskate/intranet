import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

const router = Router();

function isObjectId(value: string): boolean {
  return /^[a-f\d]{24}$/i.test(value);
}

router.get('/', async (_req, res) => {
  const groups = await prisma.ticketGroup.findMany({
    include: {
      members: {
        include: {
          user: true,
        },
      },
      _count: { select: { tickets: true } },
    },
    orderBy: { name: 'asc' },
  });
  res.json(groups);
});

router.get('/:idOrSlug', async (req, res) => {
  const key = req.params.idOrSlug;
  const group = await prisma.ticketGroup.findFirst({
    where: isObjectId(key)
      ? { OR: [{ id: key }, { slug: key }] }
      : { slug: key },
    include: {
      members: { include: { user: true } },
      _count: { select: { tickets: true } },
    },
  });

  if (!group) {
    res.status(404).json({ error: 'Grupa nie znaleziona' });
    return;
  }
  res.json(group);
});

router.put('/:id/members', async (req, res) => {
  const parsed = z.object({ userIds: z.array(z.string()) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const groupId = req.params.id;

  try {
    await prisma.groupMember.deleteMany({ where: { groupId } });
    if (parsed.data.userIds.length) {
      await prisma.groupMember.createMany({
        data: parsed.data.userIds.map((userId) => ({
          userId,
          groupId,
        })),
      });
    }

    const group = await prisma.ticketGroup.findUnique({
      where: { id: groupId },
      include: {
        members: { include: { user: true } },
      },
    });

    res.json(group);
  } catch {
    res.status(404).json({ error: 'Grupa nie znaleziona' });
  }
});

export default router;
