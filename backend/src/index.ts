import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import usersRouter from './routes/users';
import groupsRouter from './routes/groups';
import ticketsRouter from './routes/tickets';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const publicDir = path.join(__dirname, '..', 'public');
const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.set('trust proxy', 1);

const corsOrigin = process.env.CORS_ORIGIN;
app.use(
  cors({
    origin: corsOrigin ? corsOrigin.split(',').map((o) => o.trim()) : true,
  })
);
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'intranet-helpdesk' });
});

app.get('/api/client-ip', (req, res) => {
  const forwarded = req.headers['x-forwarded-for'];
  const raw =
    (typeof forwarded === 'string' ? forwarded.split(',')[0] : undefined)?.trim() ||
    req.socket.remoteAddress ||
    '';

  const ip = raw.replace(/^::ffff:/i, '');
  res.json({ ip });
});

app.use('/api/users', usersRouter);
app.use('/api/groups', groupsRouter);
app.use('/api/tickets', ticketsRouter);

if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      next();
      return;
    }
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Intranet helpdesk: http://0.0.0.0:${PORT}`);
});
