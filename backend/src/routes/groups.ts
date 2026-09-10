import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { requireAuth } from '../lib/auth';
import { cols, isObjectIdString, routeParam, toObjectId } from '../lib/db';
import { loadGroupWithMembers } from '../lib/relations';

const router = Router();

router.get('/', async (_req, res) => {
  const groups = await cols.groups().find().sort({ name: 1 }).toArray();
  const payload = await Promise.all(groups.map((g) => loadGroupWithMembers(g._id, true)));
  res.json(payload);
});

router.get('/:idOrSlug', async (req, res) => {
  const key = routeParam(req.params.idOrSlug);
  const group = isObjectIdString(key)
    ? await cols.groups().findOne({ $or: [{ _id: toObjectId(key) }, { slug: key }] })
    : await cols.groups().findOne({ slug: key });

  if (!group) {
    res.status(404).json({ error: 'Grupa nie znaleziona' });
    return;
  }

  res.json(await loadGroupWithMembers(group._id, true));
});

router.put('/:id/members', requireAuth, async (req, res) => {
  const parsed = z.object({ userIds: z.array(z.string()) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  let groupId: ObjectId;
  try {
    groupId = toObjectId(routeParam(req.params.id));
  } catch {
    res.status(404).json({ error: 'Grupa nie znaleziona' });
    return;
  }

  const group = await cols.groups().findOne({ _id: groupId });
  if (!group) {
    res.status(404).json({ error: 'Grupa nie znaleziona' });
    return;
  }

  await cols.members().deleteMany({ groupId });
  if (parsed.data.userIds.length) {
    await cols.members().insertMany(
      parsed.data.userIds.map((userId) => ({
        _id: new ObjectId(),
        userId: toObjectId(userId),
        groupId,
      }))
    );
  }

  res.json(await loadGroupWithMembers(groupId));
});

export default router;
