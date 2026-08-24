import 'dotenv/config';
import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

/** Domyślne grupy zgłoszeń (jak na legacy helpdesku) */
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

/** Osoby odpowiedzialne — konta domyślne przypisane do grup */
const agents: Array<{
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  groupSlug: string;
}> = [
  // Informatyka
  { firstName: 'Krzysztof', lastName: 'Besz', email: 'k.besz@szpital.local', department: 'IT', groupSlug: 'informatyka' },
  { firstName: 'Krzysztof', lastName: 'Kretek', email: 'k.kretek@szpital.local', department: 'IT', groupSlug: 'informatyka' },
  { firstName: 'Piotr', lastName: 'Krukowski', email: 'p.krukowski@szpital.local', department: 'IT', groupSlug: 'informatyka' },
  { firstName: 'Tomasz', lastName: 'Centner', email: 't.centner@szpital.local', department: 'IT', groupSlug: 'informatyka' },
  // Aparatura medyczna
  { firstName: 'Piotr', lastName: 'Lelek', email: 'p.lelek@szpital.local', department: 'Aparatura medyczna', groupSlug: 'aparatura-medyczna' },
  { firstName: 'Piotr', lastName: 'Kocur', email: 'p.kocur@szpital.local', department: 'Aparatura medyczna', groupSlug: 'aparatura-medyczna' },
  // Telefony i kontrola dostępu
  { firstName: 'Mariusz', lastName: 'Bujnowski', email: 'm.bujnowski@szpital.local', department: 'Telefony i kontrola dostępu', groupSlug: 'telefony-kontrola-dostepu' },
  // Dział Techniczny
  { firstName: 'Adam', lastName: 'Jeszka', email: 'a.jeszka@szpital.local', department: 'Dział Techniczny', groupSlug: 'dzial-techniczny' },
  { firstName: 'Stanisław', lastName: 'Tomkiewicz', email: 's.tomkiewicz@szpital.local', department: 'Dział Techniczny', groupSlug: 'dzial-techniczny' },
  { firstName: 'Mirosław', lastName: 'Wiczkowski', email: 'm.wiczkowski@szpital.local', department: 'Dział Techniczny', groupSlug: 'dzial-techniczny' },
];

async function ensureGroup(data: (typeof groups)[number]) {
  const existing = await prisma.ticketGroup.findUnique({ where: { slug: data.slug } });
  if (existing) {
    return prisma.ticketGroup.update({
      where: { id: existing.id },
      data: { name: data.name, description: data.description },
    });
  }
  return prisma.ticketGroup.create({ data });
}

async function ensureAgent(
  agent: (typeof agents)[number],
  groupId: string
) {
  let user = await prisma.user.findUnique({ where: { email: agent.email } });

  if (user) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        firstName: agent.firstName,
        lastName: agent.lastName,
        department: agent.department,
        role: UserRole.AGENT,
      },
    });
  } else {
    user = await prisma.user.create({
      data: {
        firstName: agent.firstName,
        lastName: agent.lastName,
        email: agent.email,
        department: agent.department,
        role: UserRole.AGENT,
      },
    });
  }

  const membership = await prisma.groupMember.findUnique({
    where: { userId_groupId: { userId: user.id, groupId } },
  });

  if (!membership) {
    await prisma.groupMember.create({
      data: { userId: user.id, groupId },
    });
  }

  return user;
}

async function main() {
  const bySlug: Record<string, { id: string }> = {};

  for (const group of groups) {
    const saved = await ensureGroup(group);
    bySlug[group.slug] = saved;
  }

  for (const agent of agents) {
    await ensureAgent(agent, bySlug[agent.groupSlug].id);
  }

  const adminEmail = 'admin@szpital.local';
  const admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin) {
    await prisma.user.create({
      data: {
        firstName: 'Admin',
        lastName: 'Systemu',
        email: adminEmail,
        department: 'Administracja',
        role: UserRole.ADMIN,
      },
    });
  }

  const summary = await prisma.ticketGroup.findMany({
    include: { members: { include: { user: true } } },
    orderBy: { name: 'asc' },
  });

  console.log('Seed OK — domyślne konta i stanowiska:');
  for (const g of summary) {
    const names = g.members
      .map((m) => `${m.user.firstName} ${m.user.lastName}`)
      .join(', ');
    console.log(`  ${g.name}: ${names || 'brak'}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
