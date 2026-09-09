import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ORGANIZATIONAL_UNITS } from '../data/departments';
import { ensureWorker } from '../lib/workers';
import { sendCommentNotification, sendTicketCreatedEmails } from '../lib/mail';

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

const commentSchema = z.object({
  authorEmail: z.string().email(),
  authorName: z.string().optional().nullable(),
  body: z.string().min(1),
});

const ticketListInclude = {
  group: {
    include: {
      members: { include: { user: true } },
    },
  },
  assignee: true,
  attachments: true,
  _count: { select: { comments: true } },
} as const;

const ticketDetailInclude = {
  group: {
    include: {
      members: { include: { user: true } },
    },
  },
  assignee: true,
  attachments: true,
  comments: { orderBy: { createdAt: 'desc' as const } },
};

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
    include: ticketListInclude,
    orderBy: { createdAt: 'desc' },
  });

  res.json(tickets);
});

router.get('/:id', async (req, res) => {
  const ticket = await prisma.ticket.findUnique({
    where: { id: req.params.id },
    include: ticketDetailInclude,
  });

  if (!ticket) {
    res.status(404).json({ error: 'Zgłoszenie nie znalezione' });
    return;
  }

  res.json(ticket);
});

router.post('/', upload.array('attachments', 5), async (req, res) => {
  const parsed = ticketSchema.safeParse({
    ...req.body,
    requesterEmail: typeof req.body.requesterEmail === 'string'
      ? req.body.requesterEmail.trim().toLowerCase()
      : req.body.requesterEmail,
  });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const group = await prisma.ticketGroup.findUnique({
    where: { id: parsed.data.groupId },
    include: { members: { include: { user: true } } },
  });
  if (!group) {
    res.status(400).json({ error: 'Nieprawidłowa grupa zgłoszeń' });
    return;
  }

  await ensureWorker({
    fullName: parsed.data.requesterName,
    email: parsed.data.requesterEmail,
    phone: parsed.data.phone,
  });

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
      assignee: true,
      attachments: true,
      comments: { orderBy: { createdAt: 'desc' } },
    },
  });

  const agentEmails = group.members
    .map((m) => m.user?.email)
    .filter((e): e is string => Boolean(e));

  // Maile nie blokują odpowiedzi API
  void sendTicketCreatedEmails({
    ticketId: ticket.id,
    subject: ticket.subject,
    groupName: group.name,
    requesterName: ticket.requesterName,
    requesterEmail: ticket.requesterEmail,
    agentEmails,
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
      include: ticketDetailInclude,
    });
    res.json(ticket);
  } catch {
    res.status(404).json({ error: 'Zgłoszenie nie znalezione' });
  }
});

router.patch('/:id/assignee', async (req, res) => {
  const parsed = z
    .object({
      assigneeId: z.string().nullable(),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const existing = await prisma.ticket.findUnique({
    where: { id: req.params.id },
    include: { group: { include: { members: true } } },
  });

  if (!existing) {
    res.status(404).json({ error: 'Zgłoszenie nie znalezione' });
    return;
  }

  const assigneeId = parsed.data.assigneeId;

  if (assigneeId) {
    const isMember = existing.group.members.some((m) => m.userId === assigneeId);
    if (!isMember) {
      res.status(400).json({ error: 'Można przypisać tylko osobę z grupy zgłoszenia' });
      return;
    }
  }

  const ticket = await prisma.ticket.update({
    where: { id: existing.id },
    data: { assigneeId },
    include: ticketDetailInclude,
  });

  res.json(ticket);
});

router.get('/:id/comments', async (req, res) => {
  const ticket = await prisma.ticket.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });
  if (!ticket) {
    res.status(404).json({ error: 'Zgłoszenie nie znalezione' });
    return;
  }

  const comments = await prisma.comment.findMany({
    where: { ticketId: ticket.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json(comments);
});

router.post('/:id/comments', async (req, res) => {
  const parsed = commentSchema.safeParse({
    ...req.body,
    authorEmail:
      typeof req.body.authorEmail === 'string'
        ? req.body.authorEmail.trim().toLowerCase()
        : req.body.authorEmail,
  });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: req.params.id },
    include: {
      group: { include: { members: { include: { user: true } } } },
    },
  });
  if (!ticket) {
    res.status(404).json({ error: 'Zgłoszenie nie znalezione' });
    return;
  }

  const authorName = parsed.data.authorName?.trim() || null;

  await ensureWorker({
    fullName: authorName || parsed.data.authorEmail.split('@')[0],
    email: parsed.data.authorEmail,
    phone: '',
  });

  const comment = await prisma.comment.create({
    data: {
      ticketId: ticket.id,
      authorEmail: parsed.data.authorEmail,
      authorName,
      body: parsed.data.body.trim(),
    },
  });

  const agentEmails = ticket.group.members
    .map((m) => m.user?.email)
    .filter((e): e is string => Boolean(e));

  void sendCommentNotification({
    ticketId: ticket.id,
    subject: ticket.subject,
    authorEmail: comment.authorEmail,
    authorName: comment.authorName,
    body: comment.body,
    recipients: [ticket.requesterEmail, ...agentEmails],
  });

  res.status(201).json(comment);
});

export default router;
