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

function sameKeyPattern(
  existing: Record<string, unknown>,
  wanted: Record<string, 1 | -1>
): boolean {
  const a = Object.keys(existing);
  const b = Object.keys(wanted);
  if (a.length !== b.length) return false;
  return b.every((k) => existing[k] === wanted[k]);
}

async function ensureIndex(
  collection: Collection,
  keys: Record<string, 1 | -1>,
  options: { unique?: boolean; name?: string } = {}
): Promise<void> {
  try {
    await collection.createIndex(keys, options);
  } catch (err: unknown) {
    const code = typeof err === 'object' && err && 'code' in err ? Number((err as { code: number }).code) : 0;
    // 85 IndexOptionsConflict / 86 IndexKeySpecsConflict — często po Prismie
    if (code !== 85 && code !== 86) throw err;

    const indexes = await collection.indexes();
    for (const idx of indexes) {
      if (idx.name === '_id_') continue;
      if (sameKeyPattern(idx.key as Record<string, unknown>, keys)) {
        await collection.dropIndex(idx.name!);
      }
    }
    await collection.createIndex(keys, options);
  }
}

async function ensureIndexes(database: Db): Promise<void> {
  await Promise.all([
    ensureIndex(database.collection('User'), { email: 1 }, { unique: true }),
    ensureIndex(database.collection('TicketGroup'), { slug: 1 }, { unique: true }),
    ensureIndex(database.collection('TicketGroup'), { name: 1 }, { unique: true }),
    ensureIndex(database.collection('GroupMember'), { userId: 1, groupId: 1 }, { unique: true }),
    ensureIndex(database.collection('Worker'), { email: 1 }, { unique: true }),
    ensureIndex(database.collection('Ticket'), { groupId: 1, createdAt: -1 }),
    ensureIndex(database.collection('Comment'), { ticketId: 1, createdAt: -1 }),
    ensureIndex(database.collection('Attachment'), { ticketId: 1 }),
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

export function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
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
    if (key === 'passwordHash') {
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
