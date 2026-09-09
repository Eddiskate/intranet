import { ObjectId } from 'mongodb';
import { cols, serialize } from './db';

/** Dzieli „Imię Nazwisko …” na firstName / lastName */
export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '—', lastName: '—' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '—' };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

/** Jeśli nie ma workera z tym mailem — dodaje; inaczej aktualizuje dane kontaktowe */
export async function ensureWorker(input: {
  fullName: string;
  email: string;
  phone: string;
}) {
  const email = input.email.trim().toLowerCase();
  const { firstName, lastName } = splitFullName(input.fullName);
  const phone = input.phone.trim();
  const now = new Date();

  const existing = await cols.workers().findOne({ email });
  if (existing) {
    await cols.workers().updateOne(
      { _id: existing._id },
      {
        $set: {
          firstName,
          lastName,
          phone: phone || existing.phone,
          updatedAt: now,
        },
      }
    );
    const updated = await cols.workers().findOne({ _id: existing._id });
    return serialize(updated)!;
  }

  const _id = new ObjectId();
  const doc = {
    _id,
    firstName,
    lastName,
    email,
    phone: phone || '—',
    createdAt: now,
    updatedAt: now,
  };
  await cols.workers().insertOne(doc);
  return serialize(doc)!;
}
