import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { ORGANIZATIONAL_UNITS } from '../data/departments';
import { requireAuth, type AuthedRequest, verifyToken } from '../lib/auth';
import { cols, routeParam, serialize, toObjectId } from '../lib/db';
import { ensureRequesterUser } from '../lib/requester-user';
import { ensureWorker } from '../lib/workers';
import { sendCommentNotification, sendTicketCreatedEmails } from '../lib/mail';
import { findTicketByIdParam, loadGroupWithMembers, loadTicket } from '../lib/relations';
import { addTimelineEvent } from '../lib/timeline';
import type { TicketStatus, UserRole } from '../types';

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
  authorEmail: z.string().email().optional(),
  authorName: z.string().optional().nullable(),
  body: z.string().min(1),
});

const statusLabels: Record<TicketStatus, string> = {
  OPEN: 'Otwarte',
  IN_PROGRESS: 'W trakcie',
  RESOLVED: 'Rozwiązane',
  CLOSED: 'Zamknięte',
};

function optionalAuth(req: AuthedRequest): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    const user = verifyToken(token);
    if (user) req.user = user;
  }
}

function isRequesterRole(role: string): boolean {
  return role === 'USER' || role === 'STAFF';
}

router.get('/meta/organizational-units', (_req, res) => {
  res.json(ORGANIZATIONAL_UNITS);
});

router.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const { groupId, status } = req.query;
  const authUser = req.user!;

  const filter: Record<string, unknown> = {};

  if (isRequesterRole(authUser.role)) {
    filter.requesterEmail = authUser.email.toLowerCase();
  } else {
    const memberships = await cols.members().find({ userId: toObjectId(authUser.id) }).toArray();
    let groupIdsFilter: ObjectId[] = memberships.map((m) => m.groupId);
    if (groupIdsFilter.length === 0 && authUser.role !== 'ADMIN') {
      res.json([]);
      return;
    }
    if (authUser.role === 'ADMIN' && groupIdsFilter.length === 0) {
      // admin bez grup widzi wszystko
    } else {
      if (typeof groupId === 'string' && groupId) {
        const gid = toObjectId(groupId);
        groupIdsFilter = groupIdsFilter.filter((id) => id.equals(gid));
      }
      filter.groupId = { $in: groupIdsFilter };
    }
  }

  if (typeof status === 'string' && status) {
    filter.status = status;
  }

  const tickets = await cols.tickets().find(filter).sort({ createdAt: -1 }).toArray();
  const payload = await Promise.all(
    tickets.map((t) => loadTicket(t, { commentCount: true }))
  );
  res.json(payload);
});

router.get('/:id', async (req: AuthedRequest, res) => {
  optionalAuth(req);
  const ticket = await findTicketByIdParam(routeParam(req.params.id));
  if (!ticket) {
    res.status(404).json({ error: 'Zgłoszenie nie znalezione' });
    return;
  }
  res.json(await loadTicket(ticket, { comments: true, timeline: true }));
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

  const { user: requester, created: accountCreated } = await ensureRequesterUser({
    fullName: parsed.data.requesterName,
    email: parsed.data.requesterEmail,
    phone: parsed.data.phone,
    department: parsed.data.organizationalUnit,
  });

  const files = (req.files as Express.Multer.File[]) ?? [];
  const now = new Date();
  const ticketId = new ObjectId();

  await cols.tickets().insertOne({
    _id: ticketId,
    groupId: groupObjectId,
    assigneeId: null,
    requesterUserId: requester._id,
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

  await addTimelineEvent({
    ticketId,
    type: 'CREATED',
    message: `Utworzono zgłoszenie „${parsed.data.subject}”`,
    actorEmail: parsed.data.requesterEmail,
    actorName: parsed.data.requesterName,
    actorRole: 'USER',
    at: now,
    meta: {
      groupName: String((groupPayload as { name?: string }).name ?? ''),
      accountCreated,
    },
  });

  const ticket = await cols.tickets().findOne({ _id: ticketId });
  const full = await loadTicket(ticket!, { comments: true, timeline: true });

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
    accountCreated,
  });

  res.status(201).json(full);
});

router.patch('/:id/status', requireAuth, async (req: AuthedRequest, res) => {
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

  if (isRequesterRole(req.user!.role)) {
    res.status(403).json({ error: 'Tylko agent może zmieniać status' });
    return;
  }

  const prev = existing.status;
  const next = parsed.data.status as TicketStatus;

  await cols.tickets().updateOne(
    { _id: existing._id },
    { $set: { status: next, updatedAt: new Date() } }
  );

  if (prev !== next) {
    await addTimelineEvent({
      ticketId: existing._id,
      type: 'STATUS_CHANGED',
      message: `Status: ${statusLabels[prev]} → ${statusLabels[next]}`,
      actorEmail: req.user!.email,
      actorName: `${req.user!.firstName} ${req.user!.lastName}`,
      actorRole: req.user!.role as UserRole,
      meta: { from: prev, to: next },
    });
  }

  const ticket = await cols.tickets().findOne({ _id: existing._id });
  res.json(await loadTicket(ticket!, { comments: true, timeline: true }));
});

router.patch('/:id/assignee', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = z
    .object({
      assigneeId: z.string().nullable(),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  if (isRequesterRole(req.user!.role)) {
    res.status(403).json({ error: 'Tylko agent może przypisywać zgłoszenia' });
    return;
  }

  const existing = await findTicketByIdParam(routeParam(req.params.id));
  if (!existing) {
    res.status(404).json({ error: 'Zgłoszenie nie znalezione' });
    return;
  }

  const assigneeId = parsed.data.assigneeId;
  let assigneeName = 'Nieprzypisane';
  if (assigneeId) {
    const isMember = await cols.members().findOne({
      groupId: existing.groupId,
      userId: toObjectId(assigneeId),
    });
    if (!isMember) {
      res.status(400).json({ error: 'Można przypisać tylko osobę z grupy zgłoszenia' });
      return;
    }
    const assignee = await cols.users().findOne({ _id: toObjectId(assigneeId) });
    if (assignee) assigneeName = `${assignee.firstName} ${assignee.lastName}`;
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

  await addTimelineEvent({
    ticketId: existing._id,
    type: 'ASSIGNEE_CHANGED',
    message: `Przypisano do: ${assigneeName}`,
    actorEmail: req.user!.email,
    actorName: `${req.user!.firstName} ${req.user!.lastName}`,
    actorRole: req.user!.role as UserRole,
    meta: { assigneeId },
  });

  const ticket = await cols.tickets().findOne({ _id: existing._id });
  res.json(await loadTicket(ticket!, { comments: true, timeline: true }));
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

router.post('/:id/comments', async (req: AuthedRequest, res) => {
  optionalAuth(req);

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

  let authorEmail = parsed.data.authorEmail || '';
  let authorName = parsed.data.authorName?.trim() || null;
  let authorRole: UserRole | null = null;

  if (req.user) {
    authorEmail = req.user.email.toLowerCase();
    authorName = `${req.user.firstName} ${req.user.lastName}`;
    authorRole = req.user.role as UserRole;
  }

  if (!authorEmail) {
    res.status(400).json({ error: 'Podaj e-mail autora lub zaloguj się' });
    return;
  }

  await ensureWorker({
    fullName: authorName || authorEmail.split('@')[0],
    email: authorEmail,
    phone: '',
  });

  const now = new Date();
  const comment = {
    _id: new ObjectId(),
    ticketId: ticket._id,
    authorEmail,
    authorName,
    authorRole,
    body: parsed.data.body.trim(),
    createdAt: now,
  };
  await cols.comments().insertOne(comment);

  await addTimelineEvent({
    ticketId: ticket._id,
    type: 'COMMENT',
    message: `Komentarz: ${comment.body.slice(0, 120)}${comment.body.length > 120 ? '…' : ''}`,
    actorEmail: authorEmail,
    actorName: authorName,
    actorRole: authorRole,
    at: now,
  });

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
