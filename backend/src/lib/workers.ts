import { prisma } from './prisma';

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

  const existing = await prisma.worker.findUnique({ where: { email } });
  if (existing) {
    return prisma.worker.update({
      where: { id: existing.id },
      data: {
        firstName,
        lastName,
        phone: phone || existing.phone,
      },
    });
  }

  return prisma.worker.create({
    data: { firstName, lastName, email, phone: phone || '—' },
  });
}
