import type { ObjectId } from 'mongodb';

export type UserRole = 'USER' | 'STAFF' | 'AGENT' | 'ADMIN';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export type TimelineEventType =
  | 'CREATED'
  | 'STATUS_CHANGED'
  | 'ASSIGNEE_CHANGED'
  | 'COMMENT';

export interface UserDoc {
  _id: ObjectId;
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  phone?: string;
  role: UserRole;
  passwordHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TicketGroupDoc {
  _id: ObjectId;
  name: string;
  slug: string;
  description?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface GroupMemberDoc {
  _id: ObjectId;
  userId: ObjectId;
  groupId: ObjectId;
}

export interface TicketDoc {
  _id: ObjectId;
  groupId: ObjectId;
  assigneeId?: ObjectId | null;
  requesterUserId?: ObjectId | null;
  requesterName: string;
  requesterEmail: string;
  organizationalUnit: string;
  room: string;
  phone: string;
  subject: string;
  body: string;
  computerIp?: string | null;
  status: TicketStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface AttachmentDoc {
  _id: ObjectId;
  ticketId: ObjectId;
  originalName: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: Date;
}

export interface WorkerDoc {
  _id: ObjectId;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommentDoc {
  _id: ObjectId;
  ticketId: ObjectId;
  authorEmail: string;
  authorName?: string | null;
  authorRole?: UserRole | null;
  body: string;
  createdAt: Date;
}

export interface TimelineEventDoc {
  _id: ObjectId;
  ticketId: ObjectId;
  type: TimelineEventType;
  message: string;
  actorEmail?: string | null;
  actorName?: string | null;
  actorRole?: UserRole | null;
  meta?: Record<string, unknown> | null;
  createdAt: Date;
}
