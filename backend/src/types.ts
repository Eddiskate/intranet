import type { ObjectId } from 'mongodb';

export type UserRole = 'STAFF' | 'AGENT' | 'ADMIN';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export interface UserDoc {
  _id: ObjectId;
  firstName: string;
  lastName: string;
  email: string;
  department: string;
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
  body: string;
  createdAt: Date;
}
