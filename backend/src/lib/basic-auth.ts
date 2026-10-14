import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function readCreds(): { user: string; pass: string } | null {
  const user =
    process.env.HTAUTH_USER ||
    process.env.BASIC_AUTH_USER ||
    process.env.HTACCESS_USER ||
    '';
  const pass =
    process.env.HTAUTH_PASS ||
    process.env.BASIC_AUTH_PASS ||
    process.env.HTACCESS_PASS ||
    '';
  if (!user || !pass) return null;
  return { user, pass };
}

/** HTTP Basic Auth — włączany gdy HTAUTH_USER + HTAUTH_PASS są ustawione (EasyPanel). */
export function basicAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const creds = readCreds();
  if (!creds) {
    next();
    return;
  }

  // Healthcheck EasyPanel / Docker bez logowania
  if (req.path === '/api/health' || req.path === '/health') {
    next();
    return;
  }

  const header = req.headers.authorization;
  if (!header?.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Intranet Helpdesk"');
    res.status(401).send('Wymagane logowanie (HTTP Basic Auth)');
    return;
  }

  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    const user = sep >= 0 ? decoded.slice(0, sep) : decoded;
    const pass = sep >= 0 ? decoded.slice(sep + 1) : '';

    if (safeEqual(user, creds.user) && safeEqual(pass, creds.pass)) {
      next();
      return;
    }
  } catch {
    /* fall through */
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="Intranet Helpdesk"');
  res.status(401).send('Nieprawidłowy login lub hasło');
}

export function isBasicAuthEnabled(): boolean {
  return readCreds() !== null;
}
