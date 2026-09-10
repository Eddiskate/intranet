import { ObjectId } from 'mongodb';
import { hashPassword } from './auth';
import { cols } from './db';
import { loadGroupWithMembers } from './relations';

/** Domyślne hasło seedowanych kont (zmień po pierwszym logowaniu). */
export const DEFAULT_SEED_PASSWORD = 'helpdesk';

const groups = [
  {
    name: 'Informatyka',
    slug: 'informatyka',
    description: 'Sprzęt komputerowy, sieć, oprogramowanie, konta użytkowników',
  },
  {
    name: 'Aparatura medyczna',
    slug: 'aparatura-medyczna',
    description: 'Urządzenia medyczne, serwis i awarie aparatury',
  },
  {
    name: 'Telefony i kontrola dostępu',
    slug: 'telefony-kontrola-dostepu',
    description: 'Telefonia, karty dostępu, domofony',
  },
  {
    name: 'Dział Techniczny',
    slug: 'dzial-techniczny',
    description: 'Instalacje, hydraulika, elektryka, utrzymanie budynku',
  },
];

const agents: Array<{
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  groupSlug: string;
}> = [
  { firstName: 'Krzysztof', lastName: 'Besz', email: 'k.besz@szpital.local', department: 'IT', groupSlug: 'informatyka' },
  { firstName: 'Krzysztof', lastName: 'Kretek', email: 'k.kretek@szpital.local', department: 'IT', groupSlug: 'informatyka' },
  { firstName: 'Piotr', lastName: 'Krukowski', email: 'p.krukowski@szpital.local', department: 'IT', groupSlug: 'informatyka' },
  { firstName: 'Tomasz', lastName: 'Centner', email: 't.centner@szpital.local', department: 'IT', groupSlug: 'informatyka' },
  { firstName: 'Piotr', lastName: 'Lelek', email: 'p.lelek@szpital.local', department: 'Aparatura medyczna', groupSlug: 'aparatura-medyczna' },
  { firstName: 'Piotr', lastName: 'Kocur', email: 'p.kocur@szpital.local', department: 'Aparatura medyczna', groupSlug: 'aparatura-medyczna' },
  { firstName: 'Mariusz', lastName: 'Bujnowski', email: 'm.bujnowski@szpital.local', department: 'Telefony i kontrola dostępu', groupSlug: 'telefony-kontrola-dostepu' },
  { firstName: 'Adam', lastName: 'Jeszka', email: 'a.jeszka@szpital.local', department: 'Dział Techniczny', groupSlug: 'dzial-techniczny' },
  { firstName: 'Stanisław', lastName: 'Tomkiewicz', email: 's.tomkiewicz@szpital.local', department: 'Dział Techniczny', groupSlug: 'dzial-techniczny' },
  { firstName: 'Mirosław', lastName: 'Wiczkowski', email: 'm.wiczkowski@szpital.local', department: 'Dział Techniczny', groupSlug: 'dzial-techniczny' },
];

export async function seedDefaults() {
  const now = new Date();
  const bySlug: Record<string, ObjectId> = {};
  const passwordHash = await hashPassword(DEFAULT_SEED_PASSWORD);

  for (const group of groups) {
    const existing = await cols.groups().findOne({ slug: group.slug });
    if (existing) {
      await cols.groups().updateOne(
        { _id: existing._id },
        { $set: { name: group.name, description: group.description, updatedAt: now } }
      );
      bySlug[group.slug] = existing._id;
    } else {
      const _id = new ObjectId();
      await cols.groups().insertOne({
        _id,
        name: group.name,
        slug: group.slug,
        description: group.description,
        createdAt: now,
        updatedAt: now,
      });
      bySlug[group.slug] = _id;
    }
  }

  for (const agent of agents) {
    const existingUser = await cols.users().findOne({ email: agent.email });
    let userId: ObjectId;

    if (existingUser) {
      userId = existingUser._id;
      await cols.users().updateOne(
        { _id: userId },
        {
          $set: {
            firstName: agent.firstName,
            lastName: agent.lastName,
            department: agent.department,
            role: 'AGENT',
            updatedAt: now,
            ...(!existingUser.passwordHash ? { passwordHash } : {}),
          },
        }
      );
    } else {
      userId = new ObjectId();
      await cols.users().insertOne({
        _id: userId,
        firstName: agent.firstName,
        lastName: agent.lastName,
        email: agent.email,
        department: agent.department,
        role: 'AGENT',
        passwordHash,
        createdAt: now,
        updatedAt: now,
      });
    }

    const groupId = bySlug[agent.groupSlug];
    const membership = await cols.members().findOne({ userId, groupId });
    if (!membership) {
      await cols.members().insertOne({
        _id: new ObjectId(),
        userId,
        groupId,
      });
    }
  }

  const adminEmail = 'admin@szpital.local';
  const existingAdmin = await cols.users().findOne({ email: adminEmail });
  if (!existingAdmin) {
    await cols.users().insertOne({
      _id: new ObjectId(),
      firstName: 'Admin',
      lastName: 'Systemu',
      email: adminEmail,
      department: 'Administracja',
      role: 'ADMIN',
      passwordHash,
      createdAt: now,
      updatedAt: now,
    });
  } else if (!existingAdmin.passwordHash) {
    await cols.users().updateOne(
      { _id: existingAdmin._id },
      { $set: { passwordHash, updatedAt: now } }
    );
  }

  const allGroups = await cols.groups().find().sort({ name: 1 }).toArray();
  const summary = [];
  for (const g of allGroups) {
    const payload = await loadGroupWithMembers(g._id);
    summary.push({
      name: g.name,
      members: (payload?.members || [])
        .map((m) => {
          const u = m.user as { firstName?: string; lastName?: string } | null;
          return u ? `${u.firstName} ${u.lastName}` : '';
        })
        .filter(Boolean),
    });
  }

  return {
    groups: allGroups.length,
    users: await cols.users().countDocuments(),
    summary,
  };
}

/** Dla kont bez hasła (migracja) — ustawia domyślne hasło seed. */
export async function backfillMissingPasswords(): Promise<number> {
  const missing = await cols
    .users()
    .find({
      $or: [
        { passwordHash: { $exists: false } },
        { passwordHash: '' },
      ],
    } as import('mongodb').Filter<import('../types').UserDoc>)
    .project({ _id: 1 })
    .toArray();

  if (!missing.length) return 0;

  const passwordHash = await hashPassword(DEFAULT_SEED_PASSWORD);
  await cols.users().updateMany(
    { _id: { $in: missing.map((u) => u._id) } },
    { $set: { passwordHash, updatedAt: new Date() } }
  );
  return missing.length;
}
