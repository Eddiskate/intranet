import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

/**
 * Lokalnie: `.env`
 * Produkcja (plik): `.env.production`
 * EasyPanel: zmienne z panelu nadpisują plik, gdy są w procesie.
 */
const candidates = [
  path.join(process.cwd(), '.env'),
  path.join(__dirname, '..', '.env'),
  path.join(__dirname, '..', '..', '.env'),
];

const envPath = candidates.find((p) => fs.existsSync(p));
if (envPath) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

if (process.env.NODE_ENV === 'production') {
  const prodCandidates = [
    path.join(process.cwd(), '.env.production'),
    path.join(__dirname, '..', '.env.production'),
  ];
  const prodPath = prodCandidates.find((p) => fs.existsSync(p));
  if (prodPath) {
    dotenv.config({ path: prodPath, override: true });
  }
}
