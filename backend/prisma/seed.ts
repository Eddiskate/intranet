import 'dotenv/config';
import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

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

async function main() {
  await prisma.attachment.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.groupMember.deleteMany();
  await prisma.user.deleteMany();
  await prisma.ticketGroup.deleteMany();

  for (const group of groups) {
    await prisma.ticketGroup.create({ data: group });
  }

  const createdGroups = await prisma.ticketGroup.findMany();
  const bySlug = Object.fromEntries(createdGroups.map((g) => [g.slug, g]));

  for (const agent of agents) {
    const user = await prisma.user.create({
      data: {
        firstName: agent.firstName,
        lastName: agent.lastName,
        email: agent.email,
        department: agent.department,
        role: UserRole.AGENT,
      },
    });

    await prisma.groupMember.create({
      data: {
        userId: user.id,
        groupId: bySlug[agent.groupSlug].id,
      },
    });
  }

  await prisma.user.create({
    data: {
      firstName: 'Admin',
      lastName: 'Systemu',
      email: 'admin@szpital.local',
      department: 'Administracja',
      role: UserRole.ADMIN,
    },
  });

  console.log('Seed OK: 4 grupy + agenci helpdesku');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
