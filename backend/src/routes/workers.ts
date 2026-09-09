import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { cols, serialize } from '../lib/db';

const router = Router();

const workerSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
});

router.get('/', async (_req, res) => {
  const workers = await cols.workers().find().sort({ lastName: 1, firstName: 1 }).toArray();
  res.json(workers.map((w) => serialize(w)!));
});

router.post('/', async (req, res) => {
  const parsed = workerSchema.safeParse({
    ...req.body,
    email: typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : req.body.email,
  });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const existing = await cols.workers().findOne({ email: parsed.data.email });
  if (existing) {
    res.status(409).json({ error: 'Worker z tym e-mailem już istnieje' });
    return;
  }

  const now = new Date();
  const doc = {
    _id: new ObjectId(),
    ...parsed.data,
    createdAt: now,
    updatedAt: now,
  };
  await cols.workers().insertOne(doc);
  res.status(201).json(serialize(doc)!);
});

export default router;
