export interface TicketGroup {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  members: GroupMember[];
  _count?: { tickets: number };
}

export interface GroupMember {
  id: string;
  userId: string;
  groupId: string;
  user?: User;
  group?: TicketGroup;
}

export type UserRole = 'USER' | 'STAFF' | 'AGENT' | 'ADMIN';

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  phone?: string;
  role: UserRole;
  groups?: GroupMember[];
}

export interface Worker {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  createdAt: string;
  updatedAt: string;
}

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export type TimelineEventType = 'CREATED' | 'STATUS_CHANGED' | 'ASSIGNEE_CHANGED' | 'COMMENT';

export interface Attachment {
  id: string;
  originalName: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface TicketComment {
  id: string;
  ticketId: string;
  authorEmail: string;
  authorName?: string | null;
  authorRole?: UserRole | null;
  body: string;
  createdAt: string;
}

export interface TimelineEvent {
  id: string;
  ticketId: string;
  type: TimelineEventType;
  message: string;
  actorEmail?: string | null;
  actorName?: string | null;
  actorRole?: UserRole | null;
  meta?: Record<string, unknown> | null;
  createdAt: string;
}

export interface Ticket {
  id: string;
  groupId: string;
  assigneeId?: string | null;
  requesterUserId?: string | null;
  requesterName: string;
  requesterEmail: string;
  organizationalUnit: string;
  room: string;
  phone: string;
  subject: string;
  body: string;
  computerIp?: string | null;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  group?: TicketGroup;
  assignee?: User | null;
  attachments?: Attachment[];
  comments?: TicketComment[];
  timeline?: TimelineEvent[];
  _count?: { comments: number };
}

export interface CreateTicketPayload {
  groupId: string;
  requesterName: string;
  requesterEmail: string;
  organizationalUnit: string;
  room: string;
  phone: string;
  subject: string;
  body: string;
  computerIp?: string;
  attachments?: File[];
}

export interface CreateCommentPayload {
  authorEmail?: string;
  authorName?: string;
  body: string;
}
