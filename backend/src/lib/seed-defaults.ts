import { PrismaClient, UserRole } from '@prisma/client';

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

export async function seedDefaults(prisma: PrismaClient = new PrismaClient()) {
  const bySlug: Record<string, { id: string }> = {};

  for (const group of groups) {
    const existing = await prisma.ticketGroup.findUnique({ where: { slug: group.slug } });
    const saved = existing
      ? await prisma.ticketGroup.update({
          where: { id: existing.id },
          data: { name: group.name, description: group.description },
        })
      : await prisma.ticketGroup.create({ data: group });
    bySlug[group.slug] = saved;
  }

  for (const agent of agents) {
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

    const groupId = bySlug[agent.groupSlug].id;
    const membership = await prisma.groupMember.findUnique({
      where: { userId_groupId: { userId: user.id, groupId } },
    });
    if (!membership) {
      await prisma.groupMember.create({ data: { userId: user.id, groupId } });
    }
  }

  const adminEmail = 'admin@szpital.local';
  if (!(await prisma.user.findUnique({ where: { email: adminEmail } }))) {
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

  return {
    groups: summary.length,
    users: await prisma.user.count(),
    summary: summary.map((g) => ({
      name: g.name,
      members: g.members.map((m) => `${m.user.firstName} ${m.user.lastName}`),
    })),
  };
}
