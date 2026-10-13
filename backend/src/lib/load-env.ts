import path from 'path';
import dotenv from 'dotenv';

/**
 * Lokalnie: `.env`
 * Produkcja (plik): `.env.production` (nadpisuje wartości z `.env` jeśli oba istnieją)
 * EasyPanel: zmienne z panelu i tak wygrywają nad plikiem, gdy są ustawione w procesie.
 */
const root = path.join(__dirname, '..');
const isProd = process.env.NODE_ENV === 'production';

dotenv.config({ path: path.join(root, '.env') });
if (isProd) {
  dotenv.config({ path: path.join(root, '.env.production'), override: true });
}
