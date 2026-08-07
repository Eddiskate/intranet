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

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  role: 'STAFF' | 'AGENT' | 'ADMIN';
  groups?: GroupMember[];
}

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export interface Attachment {
  id: string;
  originalName: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface Ticket {
  id: string;
  groupId: string;
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
  attachments?: Attachment[];
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
