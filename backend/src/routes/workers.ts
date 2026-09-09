import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

const router = Router();

const workerSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
});

router.get('/', async (_req, res) => {
  const workers = await prisma.worker.findMany({
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });
  res.json(workers);
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

  try {
    const worker = await prisma.worker.create({ data: parsed.data });
    res.status(201).json(worker);
  } catch {
    res.status(409).json({ error: 'Worker z tym e-mailem już istnieje' });
  }
});

export default router;
