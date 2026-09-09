import { MongoClient, Db, Collection, ObjectId, type Document } from 'mongodb';
import type {
  AttachmentDoc,
  CommentDoc,
  GroupMemberDoc,
  TicketDoc,
  TicketGroupDoc,
  UserDoc,
  WorkerDoc,
} from '../types';

let client: MongoClient | null = null;
let db: Db | null = null;

export function getMongoUrl(): string {
  const url = process.env.DATABASE_URL || process.env.MONGO_URL;
  if (!url) {
    throw new Error('DATABASE_URL or MONGO_URL is required');
  }
  return url;
}

export async function connectDb(): Promise<Db> {
  if (db) return db;

  client = new MongoClient(getMongoUrl());
  await client.connect();
  db = client.db();
  await ensureIndexes(db);
  return db;
}

export function getDb(): Db {
  if (!db) {
    throw new Error('Database not connected — call connectDb() first');
  }
  return db;
}

export async function disconnectDb(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

async function ensureIndexes(database: Db): Promise<void> {
  await Promise.all([
    database.collection('User').createIndex({ email: 1 }, { unique: true }),
    database.collection('TicketGroup').createIndex({ slug: 1 }, { unique: true }),
    database.collection('TicketGroup').createIndex({ name: 1 }, { unique: true }),
    database.collection('GroupMember').createIndex({ userId: 1, groupId: 1 }, { unique: true }),
    database.collection('Worker').createIndex({ email: 1 }, { unique: true }),
    database.collection('Ticket').createIndex({ groupId: 1, createdAt: -1 }),
    database.collection('Comment').createIndex({ ticketId: 1, createdAt: -1 }),
    database.collection('Attachment').createIndex({ ticketId: 1 }),
  ]);
}

export const cols = {
  users: (): Collection<UserDoc> => getDb().collection('User'),
  groups: (): Collection<TicketGroupDoc> => getDb().collection('TicketGroup'),
  members: (): Collection<GroupMemberDoc> => getDb().collection('GroupMember'),
  tickets: (): Collection<TicketDoc> => getDb().collection('Ticket'),
  attachments: (): Collection<AttachmentDoc> => getDb().collection('Attachment'),
  workers: (): Collection<WorkerDoc> => getDb().collection('Worker'),
  comments: (): Collection<CommentDoc> => getDb().collection('Comment'),
};

export function toObjectId(id: string): ObjectId {
  return new ObjectId(id);
}

export function isObjectIdString(value: string): boolean {
  return ObjectId.isValid(value) && String(new ObjectId(value)) === value;
}

/** API JSON: `_id` → `id` (hex), ObjectId fields → string */
export function serialize<T extends Document>(doc: T | null | undefined): Record<string, unknown> | null {
  if (!doc) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc)) {
    if (key === '_id') {
      out.id = value instanceof ObjectId ? value.toHexString() : String(value);
      continue;
    }
    if (value instanceof ObjectId) {
      out[key] = value.toHexString();
    } else if (value instanceof Date) {
      out[key] = value.toISOString();
    } else if (Array.isArray(value)) {
      out[key] = value.map((item) =>
        item && typeof item === 'object' && !(item instanceof ObjectId) && !(item instanceof Date)
          ? serialize(item as Document)
          : item instanceof ObjectId
            ? item.toHexString()
            : item
      );
    } else if (value && typeof value === 'object' && !(value instanceof ObjectId)) {
      out[key] = serialize(value as Document);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function serializeMany<T extends Document>(docs: T[]): Record<string, unknown>[] {
  return docs.map((d) => serialize(d)!);
}
