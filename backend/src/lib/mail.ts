import nodemailer from 'nodemailer';

function appBaseUrl(): string {
  return (process.env.APP_URL || 'http://localhost:4200').replace(/\/$/, '');
}

export function ticketUrl(ticketId: string): string {
  return `${appBaseUrl()}/helpdesk/tickets/${ticketId}`;
}

function createTransport() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;

  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          }
        : undefined,
  });
}

async function sendMail(options: {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
}): Promise<boolean> {
  const transport = createTransport();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'helpdesk@localhost';

  if (!transport) {
    console.warn('[mail] SMTP_HOST not set — skipping email:', options.subject, '→', options.to);
    return false;
  }

  try {
    await transport.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
    return true;
  } catch (err) {
    console.error('[mail] send failed:', err);
    return false;
  }
}

export async function sendAccountCredentialsEmail(input: {
  email: string;
  firstName: string;
  password: string;
}): Promise<boolean> {
  const loginUrl = `${appBaseUrl()}/login`;
  return sendMail({
    to: input.email,
    subject: 'Helpdesk: dostęp do konta użytkownika',
    text: [
      `Witaj ${input.firstName},`,
      '',
      'Utworzono dla Ciebie konto w Intranecie Helpdesk (po złożeniu zgłoszenia).',
      '',
      `E-mail: ${input.email}`,
      `Hasło tymczasowe: ${input.password}`,
      '',
      `Zaloguj się: ${loginUrl}`,
      '',
      'Po zalogowaniu zobaczysz swoje zgłoszenia i ich status oraz możesz dodawać komentarze.',
      '',
      'Intranet Helpdesk',
    ].join('\n'),
    html: `
      <p>Witaj <strong>${escapeHtml(input.firstName)}</strong>,</p>
      <p>Utworzono dla Ciebie konto w Intranecie Helpdesk (po złożeniu zgłoszenia).</p>
      <p>
        <strong>E-mail:</strong> ${escapeHtml(input.email)}<br/>
        <strong>Hasło tymczasowe:</strong> <code>${escapeHtml(input.password)}</code>
      </p>
      <p><a href="${loginUrl}">Zaloguj się do panelu</a></p>
      <p>Po zalogowaniu zobaczysz swoje zgłoszenia, status oraz możesz prowadzić komunikację w wątku.</p>
      <p style="color:#666;font-size:12px">Intranet Helpdesk</p>
    `,
  });
}

export async function sendTicketCreatedEmails(input: {  ticketId: string;
  subject: string;
  groupName: string;
  requesterName: string;
  requesterEmail: string;
  agentEmails: string[];
  accountCreated?: boolean;
}): Promise<void> {
  const link = ticketUrl(input.ticketId);
  const loginHint = input.accountCreated
    ? '\nNa podany adres wysłaliśmy też dane do logowania do panelu zgłoszeń.\n'
    : '\nMożesz śledzić status po zalogowaniu na swoje konto Helpdesk.\n';

  // 1) Potwierdzenie dla zgłaszającego
  await sendMail({
    to: input.requesterEmail,
    subject: `Helpdesk: przyjęto zgłoszenie „${input.subject}”`,
    text: [
      `Witaj ${input.requesterName},`,
      '',
      `Twoje zgłoszenie do grupy „${input.groupName}” zostało przyjęte.`,
      `Temat: ${input.subject}`,
      loginHint,
      `Podgląd zgłoszenia: ${link}`,
      '',
      'Intranet Helpdesk',
    ].join('\n'),
    html: `
      <p>Witaj <strong>${escapeHtml(input.requesterName)}</strong>,</p>
      <p>Twoje zgłoszenie do grupy <strong>${escapeHtml(input.groupName)}</strong> zostało przyjęte.</p>
      <p><strong>Temat:</strong> ${escapeHtml(input.subject)}</p>
      ${
        input.accountCreated
          ? '<p>Na ten adres wysłaliśmy też <strong>dane do logowania</strong> do panelu zgłoszeń.</p>'
          : '<p>Możesz śledzić status po zalogowaniu na swoje konto Helpdesk.</p>'
      }
      <p><a href="${link}">Otwórz zgłoszenie</a></p>
      <p style="color:#666;font-size:12px">Intranet Helpdesk</p>
    `,
  });

  // 2) Powiadomienie dla osób obsługujących grupę
  const agents = input.agentEmails.filter(Boolean);
  if (agents.length) {
    await sendMail({
      to: agents,
      subject: `Helpdesk: nowe zgłoszenie — ${input.subject}`,
      text: [
        `Nowe zgłoszenie w grupie „${input.groupName}”.`,
        `Od: ${input.requesterName} <${input.requesterEmail}>`,
        `Temat: ${input.subject}`,
        '',
        `Otwórz: ${link}`,
      ].join('\n'),
      html: `
        <p>Nowe zgłoszenie w grupie <strong>${escapeHtml(input.groupName)}</strong>.</p>
        <p><strong>Od:</strong> ${escapeHtml(input.requesterName)} &lt;${escapeHtml(input.requesterEmail)}&gt;</p>
        <p><strong>Temat:</strong> ${escapeHtml(input.subject)}</p>
        <p><a href="${link}">Otwórz zgłoszenie</a></p>
      `,
    });
  }
}

export async function sendCommentNotification(input: {
  ticketId: string;
  subject: string;
  authorEmail: string;
  authorName?: string | null;
  body: string;
  recipients: string[];
}): Promise<void> {
  const recipients = [...new Set(input.recipients.filter((e) => e && e !== input.authorEmail))];
  if (!recipients.length) return;

  const link = ticketUrl(input.ticketId);
  const who = input.authorName || input.authorEmail;

  await sendMail({
    to: recipients,
    subject: `Helpdesk: nowy komentarz — ${input.subject}`,
    text: [
      `Nowy komentarz do zgłoszenia „${input.subject}”.`,
      `Autor: ${who} <${input.authorEmail}>`,
      '',
      input.body,
      '',
      `Otwórz: ${link}`,
    ].join('\n'),
    html: `
      <p>Nowy komentarz do zgłoszenia <strong>${escapeHtml(input.subject)}</strong>.</p>
      <p><strong>Autor:</strong> ${escapeHtml(who)} &lt;${escapeHtml(input.authorEmail)}&gt;</p>
      <blockquote style="border-left:3px solid #ccc;padding-left:12px;color:#333">${escapeHtml(input.body)}</blockquote>
      <p><a href="${link}">Otwórz zgłoszenie</a></p>
    `,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
