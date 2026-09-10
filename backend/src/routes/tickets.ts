import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { ORGANIZATIONAL_UNITS } from '../data/departments';
import { requireAuth, type AuthedRequest } from '../lib/auth';
import { cols, routeParam, serialize, toObjectId } from '../lib/db';
import { ensureWorker } from '../lib/workers';
import { sendCommentNotification, sendTicketCreatedEmails } from '../lib/mail';
import { findTicketByIdParam, loadGroupWithMembers, loadTicket } from '../lib/relations';
import type { TicketStatus } from '../types';

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

router.get('/meta/organizational-units', (_req, res) => {
  res.json(ORGANIZATIONAL_UNITS);
});

router.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const { groupId, status } = req.query;
  const userId = req.user!.id;

  const memberships = await cols.members().find({ userId: toObjectId(userId) }).toArray();
  let groupIdsFilter: ObjectId[] = memberships.map((m) => m.groupId);
  if (groupIdsFilter.length === 0) {
    res.json([]);
    return;
  }

  if (typeof groupId === 'string' && groupId) {
    const gid = toObjectId(groupId);
    groupIdsFilter = groupIdsFilter.filter((id) => id.equals(gid));
  }

  const filter: Record<string, unknown> = {
    groupId: { $in: groupIdsFilter },
  };
  if (typeof status === 'string' && status) {
    filter.status = status;
  }

  const tickets = await cols.tickets().find(filter).sort({ createdAt: -1 }).toArray();
  const payload = await Promise.all(
    tickets.map((t) => loadTicket(t, { commentCount: true }))
  );
  res.json(payload);
});

router.get('/:id', async (req, res) => {
  const ticket = await findTicketByIdParam(routeParam(req.params.id));
  if (!ticket) {
    res.status(404).json({ error: 'Zgłoszenie nie znalezione' });
    return;
  }
  res.json(await loadTicket(ticket, { comments: true }));
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

  let groupObjectId: ObjectId;
  try {
    groupObjectId = toObjectId(parsed.data.groupId);
  } catch {
    res.status(400).json({ error: 'Nieprawidłowa grupa zgłoszeń' });
    return;
  }

  const groupPayload = await loadGroupWithMembers(groupObjectId);
  if (!groupPayload) {
    res.status(400).json({ error: 'Nieprawidłowa grupa zgłoszeń' });
    return;
  }

  await ensureWorker({
    fullName: parsed.data.requesterName,
    email: parsed.data.requesterEmail,
    phone: parsed.data.phone,
  });

  const files = (req.files as Express.Multer.File[]) ?? [];
  const now = new Date();
  const ticketId = new ObjectId();

  await cols.tickets().insertOne({
    _id: ticketId,
    groupId: groupObjectId,
    assigneeId: null,
    requesterName: parsed.data.requesterName,
    requesterEmail: parsed.data.requesterEmail,
    organizationalUnit: parsed.data.organizationalUnit,
    room: parsed.data.room,
    phone: parsed.data.phone,
    subject: parsed.data.subject,
    body: parsed.data.body,
    computerIp: parsed.data.computerIp || null,
    status: 'OPEN',
    createdAt: now,
    updatedAt: now,
  });

  if (files.length) {
    await cols.attachments().insertMany(
      files.map((file) => ({
        _id: new ObjectId(),
        ticketId,
        originalName: file.originalname,
        filename: file.filename,
        mimeType: file.mimetype,
        size: file.size,
        createdAt: now,
      }))
    );
  }

  const ticket = await cols.tickets().findOne({ _id: ticketId });
  const full = await loadTicket(ticket!, { comments: true });

  const agentEmails = ((groupPayload.members as Array<{ user?: { email?: string } | null }>) || [])
    .map((m) => m.user?.email)
    .filter((e): e is string => Boolean(e));

  void sendTicketCreatedEmails({
    ticketId: ticketId.toHexString(),
    subject: parsed.data.subject,
    groupName: String((groupPayload as { name?: string }).name ?? ''),
    requesterName: parsed.data.requesterName,
    requesterEmail: parsed.data.requesterEmail,
    agentEmails,
  });

  res.status(201).json(full);
});

router.patch('/:id/status', requireAuth, async (req, res) => {
  const parsed = z
    .object({
      status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const existing = await findTicketByIdParam(routeParam(req.params.id));
  if (!existing) {
    res.status(404).json({ error: 'Zgłoszenie nie znalezione' });
    return;
  }

  await cols.tickets().updateOne(
    { _id: existing._id },
    { $set: { status: parsed.data.status as TicketStatus, updatedAt: new Date() } }
  );

  const ticket = await cols.tickets().findOne({ _id: existing._id });
  res.json(await loadTicket(ticket!, { comments: true }));
});

router.patch('/:id/assignee', requireAuth, async (req, res) => {
  const parsed = z
    .object({
      assigneeId: z.string().nullable(),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const existing = await findTicketByIdParam(routeParam(req.params.id));
  if (!existing) {
    res.status(404).json({ error: 'Zgłoszenie nie znalezione' });
    return;
  }

  const assigneeId = parsed.data.assigneeId;
  if (assigneeId) {
    const isMember = await cols.members().findOne({
      groupId: existing.groupId,
      userId: toObjectId(assigneeId),
    });
    if (!isMember) {
      res.status(400).json({ error: 'Można przypisać tylko osobę z grupy zgłoszenia' });
      return;
    }
  }

  await cols.tickets().updateOne(
    { _id: existing._id },
    {
      $set: {
        assigneeId: assigneeId ? toObjectId(assigneeId) : null,
        updatedAt: new Date(),
      },
    }
  );

  const ticket = await cols.tickets().findOne({ _id: existing._id });
  res.json(await loadTicket(ticket!, { comments: true }));
});

router.get('/:id/comments', async (req, res) => {
  const ticket = await findTicketByIdParam(routeParam(req.params.id));
  if (!ticket) {
    res.status(404).json({ error: 'Zgłoszenie nie znalezione' });
    return;
  }

  const comments = await cols
    .comments()
    .find({ ticketId: ticket._id })
    .sort({ createdAt: -1 })
    .toArray();
  res.json(comments.map((c) => serialize(c)!));
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

  const ticket = await findTicketByIdParam(routeParam(req.params.id));
  if (!ticket) {
    res.status(404).json({ error: 'Zgłoszenie nie znalezione' });
    return;
  }

  const groupPayload = await loadGroupWithMembers(ticket.groupId);
  const authorName = parsed.data.authorName?.trim() || null;

  await ensureWorker({
    fullName: authorName || parsed.data.authorEmail.split('@')[0],
    email: parsed.data.authorEmail,
    phone: '',
  });

  const comment = {
    _id: new ObjectId(),
    ticketId: ticket._id,
    authorEmail: parsed.data.authorEmail,
    authorName,
    body: parsed.data.body.trim(),
    createdAt: new Date(),
  };
  await cols.comments().insertOne(comment);

  const agentEmails = ((groupPayload?.members as Array<{ user?: { email?: string } | null }>) || [])
    .map((m) => m.user?.email)
    .filter((e): e is string => Boolean(e));

  void sendCommentNotification({
    ticketId: ticket._id.toHexString(),
    subject: ticket.subject,
    authorEmail: comment.authorEmail,
    authorName: comment.authorName,
    body: comment.body,
    recipients: [ticket.requesterEmail, ...agentEmails],
  });

  res.status(201).json(serialize(comment)!);
});

export default router;
