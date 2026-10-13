import { ObjectId } from 'mongodb';
import { cols } from './db';
import type { TimelineEventType, UserRole } from '../types';

export async function addTimelineEvent(input: {
  ticketId: ObjectId;
  type: TimelineEventType;
  message: string;
  actorEmail?: string | null;
  actorName?: string | null;
  actorRole?: UserRole | null;
  meta?: Record<string, unknown> | null;
  at?: Date;
}) {
  const doc = {
    _id: new ObjectId(),
    ticketId: input.ticketId,
    type: input.type,
    message: input.message,
    actorEmail: input.actorEmail ?? null,
    actorName: input.actorName ?? null,
    actorRole: input.actorRole ?? null,
    meta: input.meta ?? null,
    createdAt: input.at ?? new Date(),
  };
  await cols.timeline().insertOne(doc);
  return doc;
}

export async function listTimeline(ticketId: ObjectId) {
  return cols.timeline().find({ ticketId }).sort({ createdAt: 1 }).toArray();
}
