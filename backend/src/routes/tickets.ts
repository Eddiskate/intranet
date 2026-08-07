import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ORGANIZATIONAL_UNITS } from '../data/departments';

const router = Router();

const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${unique}${path.extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: 4 * 1024 * 1024 },
});

const ticketSchema = z.object({
  groupId: z.string().min(1),
  requesterName: z.string().min(1),
  requesterEmail: z.string().email(),
  organizationalUnit: z.string().min(1),
  room: z.string().min(1),
  phone: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  computerIp: z.string().optional().nullable(),
});

router.get('/meta/organizational-units', (_req, res) => {
  res.json(ORGANIZATIONAL_UNITS);
});

router.get('/', async (req, res) => {
  const { userId, groupId, status } = req.query;

  let groupIdsFilter: string[] | undefined;

  if (typeof userId === 'string' && userId) {
    const memberships = await prisma.groupMember.findMany({
      where: { userId },
      select: { groupId: true },
    });
    groupIdsFilter = memberships.map((m) => m.groupId);
    if (groupIdsFilter.length === 0) {
      res.json([]);
      return;
    }
  }

  if (typeof groupId === 'string' && groupId) {
    groupIdsFilter = groupIdsFilter
      ? groupIdsFilter.filter((id) => id === groupId)
      : [groupId];
  }

  const tickets = await prisma.ticket.findMany({
    where: {
      ...(groupIdsFilter ? { groupId: { in: groupIdsFilter } } : {}),
      ...(typeof status === 'string' && status
        ? { status: status as 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' }
        : {}),
    },
    include: {
      group: true,
      attachments: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json(tickets);
});

router.get('/:id', async (req, res) => {
  const ticket = await prisma.ticket.findUnique({
    where: { id: req.params.id },
    include: {
      group: {
        include: {
          members: { include: { user: true } },
        },
      },
      attachments: true,
    },
  });

  if (!ticket) {
    res.status(404).json({ error: 'Zgłoszenie nie znalezione' });
    return;
  }

  res.json(ticket);
});

router.post('/', upload.array('attachments', 5), async (req, res) => {
  const parsed = ticketSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const group = await prisma.ticketGroup.findUnique({
    where: { id: parsed.data.groupId },
  });
  if (!group) {
    res.status(400).json({ error: 'Nieprawidłowa grupa zgłoszeń' });
    return;
  }

  const files = (req.files as Express.Multer.File[]) ?? [];

  const ticket = await prisma.ticket.create({
    data: {
      ...parsed.data,
      computerIp: parsed.data.computerIp || null,
      attachments: {
        create: files.map((file) => ({
          originalName: file.originalname,
          filename: file.filename,
          mimeType: file.mimetype,
          size: file.size,
        })),
      },
    },
    include: {
      group: true,
      attachments: true,
    },
  });

  res.status(201).json(ticket);
});

router.patch('/:id/status', async (req, res) => {
  const parsed = z
    .object({
      status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const ticket = await prisma.ticket.update({
      where: { id: req.params.id },
      data: { status: parsed.data.status },
      include: { group: true, attachments: true },
    });
    res.json(ticket);
  } catch {
    res.status(404).json({ error: 'Zgłoszenie nie znalezione' });
  }
});

export default router;
