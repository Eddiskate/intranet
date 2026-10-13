import { ObjectId } from 'mongodb';
import { randomBytes } from 'crypto';
import { hashPassword } from './auth';
import { cols, serialize } from './db';
import { sendAccountCredentialsEmail } from './mail';
import { splitFullName } from './workers';
import type { UserDoc, UserRole } from '../types';

export function generateTempPassword(): string {
  // czytelne hasło tymczasowe, np. Hx7k-9Qm2
  return randomBytes(4).toString('hex') + '-' + randomBytes(2).toString('hex');
}

/**
 * Przy zgłoszeniu: tworzy/aktualizuje konto USER.
 * Nowe konto → generuje hasło i wysyła mail z danymi logowania.
 */
export async function ensureRequesterUser(input: {
  fullName: string;
  email: string;
  phone: string;
  department: string;
}): Promise<{ user: UserDoc; created: boolean; plainPassword?: string }> {
  const email = input.email.trim().toLowerCase();
  const { firstName, lastName } = splitFullName(input.fullName);
  const phone = input.phone.trim();
  const department = input.department.trim() || 'Inny';
  const now = new Date();

  const existing = await cols.users().findOne({ email });

  if (existing) {
    const keepAgentRole = existing.role === 'AGENT' || existing.role === 'ADMIN';
    await cols.users().updateOne(
      { _id: existing._id },
      {
        $set: {
          firstName,
          lastName,
          phone: phone || existing.phone || '',
          department: keepAgentRole ? existing.department : department,
          ...(keepAgentRole ? {} : { role: 'USER' as UserRole }),
          updatedAt: now,
        },
      }
    );
    const updated = (await cols.users().findOne({ _id: existing._id }))!;
    return { user: updated, created: false };
  }

  const plainPassword = generateTempPassword();
  const passwordHash = await hashPassword(plainPassword);
  const _id = new ObjectId();
  const doc: UserDoc = {
    _id,
    firstName,
    lastName,
    email,
    department,
    phone: phone || '',
    role: 'USER',
    passwordHash,
    createdAt: now,
    updatedAt: now,
  };
  await cols.users().insertOne(doc);

  void sendAccountCredentialsEmail({
    email,
    firstName,
    password: plainPassword,
  }).then((sent) => {
    if (!sent) {
      console.warn(
        `[auth] Konto USER utworzone dla ${email}, ale mail nie wyszedł (brak SMTP?). ` +
          `Hasło tymczasowe: ${plainPassword}`
      );
    }
  });

  return { user: doc, created: true, plainPassword };
}

export function publicUser(user: UserDoc) {
  return serialize(user)!;
}
