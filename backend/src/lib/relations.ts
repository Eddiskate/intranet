import { ObjectId } from 'mongodb';
import { cols, serialize, toObjectId } from './db';
import type { TicketDoc } from '../types';

export async function loadUserWithGroups(userId: ObjectId) {
  const user = await cols.users().findOne({ _id: userId });
  if (!user) return null;

  const memberships = await cols.members().find({ userId }).toArray();
  const groupIds = memberships.map((m) => m.groupId);
  const groups =
    groupIds.length > 0
      ? await cols.groups().find({ _id: { $in: groupIds } }).toArray()
      : [];
  const byId = new Map(groups.map((g) => [g._id.toHexString(), g]));

  return {
    ...serialize(user)!,
    groups: memberships.map((m) => ({
      ...serialize(m)!,
      group: serialize(byId.get(m.groupId.toHexString())!) ?? null,
    })),
  };
}

export async function loadGroupWithMembers(groupId: ObjectId, withTicketCount = false) {
  const group = await cols.groups().findOne({ _id: groupId });
  if (!group) return null;

  const memberships = await cols.members().find({ groupId }).toArray();
  const userIds = memberships.map((m) => m.userId);
  const users =
    userIds.length > 0 ? await cols.users().find({ _id: { $in: userIds } }).toArray() : [];
  const userById = new Map(users.map((u) => [u._id.toHexString(), u]));

  const base = {
    ...serialize(group)!,
    members: memberships.map((m) => ({
      ...serialize(m)!,
      user: serialize(userById.get(m.userId.toHexString())!) ?? null,
    })),
  };

  if (withTicketCount) {
    const tickets = await cols.tickets().countDocuments({ groupId });
    return { ...base, _count: { tickets } };
  }
  return base;
}

export async function loadTicket(
  ticket: TicketDoc,
  opts: { comments?: boolean; commentCount?: boolean } = {}
) {
  const [groupPayload, assignee, attachments, comments, commentCount] = await Promise.all([
    loadGroupWithMembers(ticket.groupId, false),
    ticket.assigneeId ? cols.users().findOne({ _id: ticket.assigneeId }) : Promise.resolve(null),
    cols.attachments().find({ ticketId: ticket._id }).toArray(),
    opts.comments
      ? cols
          .comments()
          .find({ ticketId: ticket._id })
          .sort({ createdAt: -1 })
          .toArray()
      : Promise.resolve([]),
    opts.commentCount
      ? cols.comments().countDocuments({ ticketId: ticket._id })
      : Promise.resolve(0),
  ]);

  const out: Record<string, unknown> = {
    ...serialize(ticket)!,
    group: groupPayload,
    assignee: serialize(assignee),
    attachments: attachments.map((a) => serialize(a)!),
  };

  if (opts.comments) {
    out.comments = comments.map((c) => serialize(c)!);
  }
  if (opts.commentCount) {
    out._count = { comments: commentCount };
  }

  return out;
}

export async function findTicketByIdParam(id: string): Promise<TicketDoc | null> {
  try {
    return await cols.tickets().findOne({ _id: toObjectId(id) });
  } catch {
    return null;
  }
}
